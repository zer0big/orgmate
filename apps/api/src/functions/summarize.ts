import { app, InvocationContext } from '@azure/functions';
import {
  SessionDocument,
  SessionSummary,
  SummarizeJob,
  sessionsContainer,
} from '../services/cosmos.js';
import { downloadJson, uploadJson, uploadText } from '../services/storage.js';
import { summarizeTranscript } from '../services/openai.js';
import { findTemplate, renderMarkdown } from '../templates/systemTemplates.js';

const TRANSCRIPT_CONTAINER = 'transcripts';
const ARTIFACT_CONTAINER = 'artifacts';
/** Mirrors extensions.queues.maxDequeueCount in host.json. */
const MAX_DEQUEUE_COUNT = 3;

interface TranscriptDocument {
  text: string;
  durationMilliseconds: number;
  segments: { speaker?: number; text: string }[];
}

async function readSession(job: SummarizeJob): Promise<SessionDocument | undefined> {
  try {
    const { resource } = await sessionsContainer
      .item(job.sessionId, job.userId)
      .read<SessionDocument>();
    return resource;
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return undefined;
    }
    throw error;
  }
}

async function saveSession(session: SessionDocument): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await sessionsContainer.item(session.id, session.userId).replace(session);
}

/**
 * Speaker labels help the model attribute decisions and action items, so the
 * transcript is rebuilt as a speaker-prefixed dialogue when diarization worked.
 */
function toDialogue(transcript: TranscriptDocument): string {
  const hasSpeakers = transcript.segments.some((segment) => segment.speaker !== undefined);
  if (!hasSpeakers) {
    return transcript.text;
  }

  const lines: string[] = [];
  let currentSpeaker: number | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      lines.push(`화자 ${(currentSpeaker ?? 0) + 1}: ${buffer.join(' ')}`);
      buffer = [];
    }
  };

  for (const segment of transcript.segments) {
    if (segment.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = segment.speaker;
    }
    buffer.push(segment.text);
  }
  flush();

  return lines.join('\n');
}

async function summarizeSession(message: unknown, context: InvocationContext): Promise<void> {
  const job = message as SummarizeJob;
  if (!job?.userId || !job?.sessionId || !job?.templateId) {
    context.error('Discarding malformed summarize job');
    return;
  }

  const template = findTemplate(job.templateId);
  if (!template) {
    context.error(`Unknown template ${job.templateId}`);
    return;
  }

  const session = await readSession(job);
  if (!session) {
    context.warn(`Session ${job.sessionId} no longer exists; skipping`);
    return;
  }
  if (!session.transcriptBlobPath) {
    context.warn(`Session ${job.sessionId} has no transcript yet; skipping`);
    return;
  }

  session.status = 'organizing';
  session.error = undefined;
  await saveSession(session);

  try {
    const transcript = await downloadJson<TranscriptDocument>(
      TRANSCRIPT_CONTAINER,
      session.transcriptBlobPath,
    );

    const meta = {
      title: session.title,
      recordedAt: session.createdAt.slice(0, 16).replace('T', ' '),
    };
    const result = await summarizeTranscript(template, toDialogue(transcript), meta);
    const markdown = renderMarkdown(template, result.data, {
      ...meta,
      durationSeconds: session.durationSeconds,
    });

    const prefix = `${session.userId}/${session.id}/${template.id}`;
    const blobPath = `${prefix}.json`;
    const markdownBlobPath = `${prefix}.md`;
    const createdAt = new Date().toISOString();

    await uploadJson(ARTIFACT_CONTAINER, blobPath, {
      sessionId: session.id,
      templateId: template.id,
      templateName: template.name,
      createdAt,
      fields: template.fields,
      data: result.data,
      markdown,
    });
    await uploadText(ARTIFACT_CONTAINER, markdownBlobPath, markdown);

    const summary: SessionSummary = {
      templateId: template.id,
      templateName: template.name,
      blobPath,
      markdownBlobPath,
      createdAt,
    };
    session.summaries = [
      ...(session.summaries ?? []).filter((item) => item.templateId !== template.id),
      summary,
    ];
    session.status = 'organized';
    await saveSession(session);

    context.log(
      `Session ${session.id} organized with ${template.id} ` +
        `(${result.promptTokens} prompt / ${result.completionTokens} completion tokens)`,
    );
  } catch (error) {
    const dequeueCount = Number(context.triggerMetadata?.dequeueCount ?? 1);
    const detail = error instanceof Error ? error.message : String(error);
    context.error(`Summarization failed for ${session.id} (attempt ${dequeueCount}): ${detail}`);

    if (dequeueCount >= MAX_DEQUEUE_COUNT) {
      session.status = 'failed';
      session.error = detail.slice(0, 1000);
    } else {
      session.status = 'transcribed';
    }
    await saveSession(session);
    throw error;
  }
}

app.storageQueue('summarizeSession', {
  queueName: '%ORGMATE_SUMMARIZE_QUEUE%',
  connection: 'ORGMATE_JOBS',
  handler: summarizeSession,
});
