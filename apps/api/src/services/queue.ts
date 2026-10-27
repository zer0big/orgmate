import { QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { loadConfig, type OrgMateConfig } from '../config.js';
import type { SummarizeJob, TranscribeJob } from './cosmos.js';

const config: OrgMateConfig = loadConfig();
const credential = new DefaultAzureCredential();

function queueClient(name: string): QueueClient {
  return new QueueClient(`${config.dataQueueEndpoint.replace(/\/+$/, '')}/${name}`, credential);
}

const transcribeQueue = queueClient(config.transcribeQueue);
const summarizeQueue = queueClient(config.summarizeQueue);

function encode(job: unknown): string {
  return Buffer.from(JSON.stringify(job), 'utf8').toString('base64');
}

/**
 * Hands a finished recording off to the background transcription worker.
 * The queue trigger expects base64 because that is the Functions default
 * encoding for the storage queue binding.
 */
export async function enqueueTranscribeJob(job: TranscribeJob): Promise<void> {
  await transcribeQueue.sendMessage(encode(job));
}

export async function enqueueSummarizeJob(job: SummarizeJob): Promise<void> {
  await summarizeQueue.sendMessage(encode(job));
}
