import { Container, CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { loadConfig } from '../config.js';

const config = loadConfig();
const client = new CosmosClient({
  endpoint: config.cosmosEndpoint,
  aadCredentials: new DefaultAzureCredential(),
});
const database = client.database(config.cosmosDatabase);

export const sessionsContainer: Container = database.container('sessions');
export const templatesContainer: Container = database.container('templates');

export type SessionStatus =
  | 'recording'
  | 'uploaded'
  | 'transcribing'
  | 'transcribed'
  | 'organizing'
  | 'organized'
  | 'failed';

export interface SessionChunk {
  index: number;
  blobPath: string;
  durationSeconds?: number;
}

export interface SessionSummary {
  templateId: string;
  templateName: string;
  blobPath: string;
  markdownBlobPath: string;
  createdAt: string;
}

export interface SessionDocument {
  id: string;
  userId: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  chunks: SessionChunk[];
  durationSeconds?: number;
  /** Headcount the user declared before recording; used as a diarization hint. */
  expectedSpeakers?: number;
  transcriptBlobPath?: string;
  /** First few hundred characters of the transcript, for list previews. */
  transcriptPreview?: string;
  speakerCount?: number;
  transcribedAt?: string;
  summaries?: SessionSummary[];
  /** Set when the user archives the session. Archived sessions are hidden by default. */
  archivedAt?: string;
  error?: string;
}

/** Message body carried on the transcription queue. */
export interface TranscribeJob {
  userId: string;
  sessionId: string;
}

/** Message body carried on the summarization queue. */
export interface SummarizeJob {
  userId: string;
  sessionId: string;
  templateId: string;
}
