import { app, InvocationContext } from '@azure/functions';
import { loadConfig } from '../config.js';
import {
  SessionDocument,
  TranscribeJob,
  sessionsContainer,
} from '../services/cosmos.js';
import { downloadBlob, uploadJson } from '../services/storage.js';
import { transcribeAudio } from '../services/speech.js';
import { applyGlossary, readGlossary, toPhraseList } from '../services/glossary.js';
import { distinctSpeakers, normalizeSpeakers } from '../services/diarization.js';

const AUDIO_CONTAINER = 'audio';
const TRANSCRIPT_CONTAINER = 'transcripts';
const PREVIEW_LENGTH = 400;
/** Mirrors extensions.queues.maxDequeueCount in host.json. */
const MAX_DEQUEUE_COUNT = 3;

const config = loadConfig();

interface TranscriptSegment {
  chunkIndex: number;
  speaker?: number;
  offsetMilliseconds: number;
  durationMilliseconds: number;
  text: string;
}

interface TranscriptDocument {
  sessionId: string;
  userId: string;
  locale: string;
  createdAt: string;
  durationMilliseconds: number;
  speakerCount: number;
  text: string;
  segments: TranscriptSegment[];
}

function transcriptBlobPath(userId: string, sessionId: string): string {
  return `${userId}/${sessionId}/transcript.json`;
}

async function readSession(job: TranscribeJob): Promise<SessionDocument | undefined> {
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
 * Transcribes every chunk of a session and stores one merged transcript.
 * Chunk offsets are rebased onto the session timeline so the summarize step
 * sees a single continuous conversation.
 *
 * The user's glossary biases recognition up front and rewrites any remaining
 * mis-recognitions afterwards, because the phrase list is a hint, not a rule.
 */
async function buildTranscript(
  session: SessionDocument,
  context: InvocationContext,
): Promise<TranscriptDocument> {
  const segments: TranscriptSegment[] = [];
  let timelineOffset = 0;
  let peakChunkSpeakers = 0;

  const terms = await readGlossary(session.userId);
  const phrases = toPhraseList(terms);
  if (phrases.length > 0) {
    context.log(`Applying ${phrases.length} glossary term(s) to session ${session.id}`);
  }

  const ordered = [...session.chunks].sort((a, b) => a.index - b.index);
  for (const chunk of ordered) {
    const audio = await downloadBlob(AUDIO_CONTAINER, chunk.blobPath);
    context.log(`Transcribing ${chunk.blobPath} (${audio.byteLength} bytes)`);

    const result = await transcribeAudio(audio, `chunk-${chunk.index}.m4a`, {
      maxSpeakers: session.expectedSpeakers,
      phrases,
    });

    peakChunkSpeakers = Math.max(peakChunkSpeakers, distinctSpeakers(result.phrases ?? []));

    for (const phrase of result.phrases ?? []) {
      if (!phrase.text?.trim()) {
        continue;
      }
      segments.push({
        chunkIndex: chunk.index,
        speaker: phrase.speaker,
        offsetMilliseconds: timelineOffset + phrase.offsetMilliseconds,
        durationMilliseconds: phrase.durationMilliseconds,
        text: applyGlossary(phrase.text.trim(), terms),
      });
    }

    timelineOffset += result.durationMilliseconds ?? 0;
  }

  const normalized = normalizeSpeakers(segments, session.expectedSpeakers);

  // Speaker ids restart on every chunk, so the union across chunks overcounts.
  // The busiest single chunk is the better lower bound.
  const speakerCount = Math.max(
    1,
    Math.min(normalized.speakerCount, session.expectedSpeakers ?? (peakChunkSpeakers || 1)),
  );

  return {
    sessionId: session.id,
    userId: session.userId,
    locale: config.transcriptionLocale,
    createdAt: new Date().toISOString(),
    durationMilliseconds: timelineOffset,
    speakerCount,
    text: normalized.segments.map((segment) => segment.text).join(' '),
    segments: normalized.segments,
  };
}

async function transcribeSession(message: unknown, context: InvocationContext): Promise<void> {
  const job = message as TranscribeJob;
  if (!job?.userId || !job?.sessionId) {
    context.error('Discarding malformed transcription job');
    return;
  }

  const session = await readSession(job);
  if (!session) {
    context.warn(`Session ${job.sessionId} no longer exists; skipping`);
    return;
  }
  if (session.status === 'transcribed' || session.status === 'organized') {
    context.log(`Session ${job.sessionId} is already transcribed; skipping`);
    return;
  }
  if (session.chunks.length === 0) {
    session.status = 'failed';
    session.error = '업로드된 녹음 청크가 없습니다.';
    await saveSession(session);
    return;
  }

  session.status = 'transcribing';
  session.error = undefined;
  await saveSession(session);

  try {
    const transcript = await buildTranscript(session, context);
    const blobPath = transcriptBlobPath(session.userId, session.id);
    await uploadJson(TRANSCRIPT_CONTAINER, blobPath, transcript);

    session.status = 'transcribed';
    session.transcriptBlobPath = blobPath;
    session.transcriptPreview = transcript.text.slice(0, PREVIEW_LENGTH);
    session.speakerCount = transcript.speakerCount;
    session.transcribedAt = transcript.createdAt;
    await saveSession(session);

    context.log(
      `Session ${session.id} transcribed: ${transcript.segments.length} segment(s), ` +
        `${transcript.speakerCount} speaker(s)`,
    );
  } catch (error) {
    const dequeueCount = Number(context.triggerMetadata?.dequeueCount ?? 1);
    const detail = error instanceof Error ? error.message : String(error);
    context.error(`Transcription failed for ${session.id} (attempt ${dequeueCount}): ${detail}`);

    // Keep the session retryable until the queue gives up, so a transient
    // Speech outage does not permanently mark the recording as failed.
    if (dequeueCount >= MAX_DEQUEUE_COUNT) {
      session.status = 'failed';
      session.error = detail.slice(0, 1000);
    } else {
      session.status = 'uploaded';
    }
    await saveSession(session);
    throw error;
  }
}

app.storageQueue('transcribeSession', {
  queueName: '%ORGMATE_TRANSCRIBE_QUEUE%',
  connection: 'ORGMATE_JOBS',
  handler: transcribeSession,
});
