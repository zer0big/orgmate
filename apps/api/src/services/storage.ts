import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { loadConfig } from '../config.js';

const SAS_LIFETIME_MINUTES = 15;
const CLOCK_SKEW_MINUTES = 5;

const config = loadConfig();
const credential = new DefaultAzureCredential();
const blobService = new BlobServiceClient(config.dataBlobEndpoint, credential);

export interface UploadTarget {
  /** Full URL including the SAS token. Write only. */
  uploadUrl: string;
  /** Blob path without the container, useful for bookkeeping. */
  blobPath: string;
  expiresOn: string;
}

/**
 * Issues a short lived, write-only user delegation SAS so the device can upload
 * audio straight to Blob Storage without routing bytes through the API.
 * The SAS is scoped to a single blob inside the caller's own folder.
 */
export async function createUploadSas(
  container: string,
  blobPath: string,
): Promise<UploadTarget> {
  const now = Date.now();
  const startsOn = new Date(now - CLOCK_SKEW_MINUTES * 60_000);
  const expiresOn = new Date(now + SAS_LIFETIME_MINUTES * 60_000);

  const delegationKey = await blobService.getUserDelegationKey(startsOn, expiresOn);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
    },
    delegationKey,
    config.dataStorageAccount,
  ).toString();

  const blobUrl = blobService.getContainerClient(container).getBlockBlobClient(blobPath).url;

  return {
    uploadUrl: `${blobUrl}?${sas}`,
    blobPath,
    expiresOn: expiresOn.toISOString(),
  };
}

export async function listBlobs(container: string, prefix: string): Promise<string[]> {
  const containerClient = blobService.getContainerClient(container);
  const names: string[] = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    names.push(blob.name);
  }
  return names;
}

export async function downloadBlob(container: string, blobPath: string): Promise<Buffer> {
  const client = blobService.getContainerClient(container).getBlockBlobClient(blobPath);
  return client.downloadToBuffer();
}

export async function uploadJson(
  container: string,
  blobPath: string,
  payload: unknown,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const client = blobService.getContainerClient(container).getBlockBlobClient(blobPath);
  await client.upload(body, body.byteLength, {
    blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
  });
}

export async function uploadText(
  container: string,
  blobPath: string,
  text: string,
  contentType = 'text/markdown; charset=utf-8',
): Promise<void> {
  const body = Buffer.from(text, 'utf8');
  const client = blobService.getContainerClient(container).getBlockBlobClient(blobPath);
  await client.upload(body, body.byteLength, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function downloadJson<T>(container: string, blobPath: string): Promise<T> {
  const buffer = await downloadBlob(container, blobPath);
  return JSON.parse(buffer.toString('utf8')) as T;
}

/** Removes every blob under a prefix. Used when a session is deleted. */
export async function deleteBlobsByPrefix(container: string, prefix: string): Promise<number> {
  const containerClient = blobService.getContainerClient(container);
  let removed = 0;
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    await containerClient.getBlockBlobClient(blob.name).deleteIfExists({
      deleteSnapshots: 'include',
    });
    removed += 1;
  }
  return removed;
}
