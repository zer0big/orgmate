import { QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { loadConfig, type OrgMateConfig } from '../config.js';
import type { TranscribeJob } from './cosmos.js';

const config: OrgMateConfig = loadConfig();
const credential = new DefaultAzureCredential();

const transcribeQueue = new QueueClient(
  `${config.dataQueueEndpoint.replace(/\/+$/, '')}/${config.transcribeQueue}`,
  credential,
);

/**
 * Hands a finished recording off to the background transcription worker.
 * The queue trigger expects base64 because that is the Functions default
 * encoding for the storage queue binding.
 */
export async function enqueueTranscribeJob(job: TranscribeJob): Promise<void> {
  const payload = Buffer.from(JSON.stringify(job), 'utf8').toString('base64');
  await transcribeQueue.sendMessage(payload);
}
