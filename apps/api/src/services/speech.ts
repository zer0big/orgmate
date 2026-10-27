import { DefaultAzureCredential } from '@azure/identity';
import { loadConfig } from '../config.js';

const API_VERSION = '2025-10-15';
const SCOPE = 'https://cognitiveservices.azure.com/.default';
/** Diarization over-splits when the hint is far above the real headcount. */
const DEFAULT_MAX_SPEAKERS = 4;
const SPEAKER_HINT_RANGE = { min: 2, max: 35 };
/** The service caps the phrase list; keep well inside it. */
const MAX_PHRASES = 100;
/** 0..2. Higher favours the glossary more strongly over the base model. */
const PHRASE_BIASING_WEIGHT = 1.5;

/** Exponential backoff per the fast transcription throttling guidance. */
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000];

const config = loadConfig();
const credential = new DefaultAzureCredential();

export interface TranscribedWord {
  text: string;
  offsetMilliseconds: number;
  durationMilliseconds: number;
}

export interface TranscribedPhrase {
  channel?: number;
  speaker?: number;
  offsetMilliseconds: number;
  durationMilliseconds: number;
  text: string;
  locale?: string;
  confidence?: number;
  words?: TranscribedWord[];
}

export interface FastTranscriptionResult {
  durationMilliseconds: number;
  combinedPhrases: { channel?: number; text: string }[];
  phrases: TranscribedPhrase[];
}

export interface TranscribeOptions {
  /** Expected headcount. Clamped to the range the service accepts. */
  maxSpeakers?: number;
  /** Domain terms boosted during recognition. */
  phrases?: string[];
}

class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/** 4xx other than 429 means the request itself is wrong, so retrying cannot help. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function transcribeUrl(): string {
  const base = config.speechEndpoint.replace(/\/+$/, '');
  return `${base}/speechtotext/transcriptions:transcribe?api-version=${API_VERSION}`;
}

async function postOnce(
  audio: Buffer,
  fileName: string,
  options: TranscribeOptions,
): Promise<FastTranscriptionResult> {
  const token = await credential.getToken(SCOPE);
  if (!token) {
    throw new TranscriptionError('Failed to acquire a Speech access token', 401, false);
  }

  const maxSpeakers = Math.min(
    SPEAKER_HINT_RANGE.max,
    Math.max(SPEAKER_HINT_RANGE.min, options.maxSpeakers ?? DEFAULT_MAX_SPEAKERS),
  );
  const phrases = (options.phrases ?? []).slice(0, MAX_PHRASES);

  const definition: Record<string, unknown> = {
    locales: [config.transcriptionLocale],
    profanityFilterMode: 'None',
    // Diarization requires mono audio, which is what the mobile client records.
    diarization: { enabled: true, maxSpeakers },
  };
  if (phrases.length > 0) {
    definition.phraseList = { phrases, biasingWeight: PHRASE_BIASING_WEIGHT };
  }

  const form = new FormData();
  form.append('definition', JSON.stringify(definition));
  form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/mp4' }), fileName);

  const response = await fetch(transcribeUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}` },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new TranscriptionError(
      `Fast transcription failed (${response.status}): ${detail.slice(0, 500)}`,
      response.status,
      isRetryable(response.status),
    );
  }

  return (await response.json()) as FastTranscriptionResult;
}

/**
 * Transcribes a single audio buffer. Retries throttling and transient server
 * errors with exponential backoff; client errors fail fast.
 */
export async function transcribeAudio(
  audio: Buffer,
  fileName: string,
  options: TranscribeOptions = {},
): Promise<FastTranscriptionResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await postOnce(audio, fileName, options);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof TranscriptionError ? error.retryable : true;
      if (!retryable || attempt === RETRY_DELAYS_MS.length) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}
