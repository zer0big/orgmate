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

export interface SessionDocument {
  id: string;
  userId: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  chunks: SessionChunk[];
  durationSeconds?: number;
  transcriptBlobPath?: string;
  error?: string;
}
