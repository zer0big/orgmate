import { File, UploadTask, UploadType } from 'expo-file-system';
import { config } from '../config';
import { getAccessToken } from '../auth/useAuth';

export interface SessionChunk {
  index: number;
  blobPath: string;
}

export interface Session {
  id: string;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  chunks: SessionChunk[];
  durationSeconds?: number;
}

export interface UploadTarget {
  uploadUrl: string;
  blobPath: string;
  expiresOn: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('로그인이 필요합니다.');
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${path} 실패 (${response.status}): ${detail}`);
  }

  return (await response.json()) as T;
}

export function createSession(title?: string): Promise<Session> {
  return call<Session>('/sessions', { method: 'POST', body: JSON.stringify({ title }) });
}

export function listSessions(): Promise<{ sessions: Session[] }> {
  return call<{ sessions: Session[] }>('/sessions');
}

export function getSession(sessionId: string): Promise<Session> {
  return call<Session>(`/sessions/${sessionId}`);
}

export function completeSession(
  sessionId: string,
  chunkCount: number,
  durationSeconds: number,
): Promise<Session> {
  return call<Session>(`/sessions/${sessionId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ chunkCount, durationSeconds }),
  });
}

function requestUploadUrl(sessionId: string, chunkIndex: number): Promise<UploadTarget> {
  return call<UploadTarget>(`/sessions/${sessionId}/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ chunkIndex }),
  });
}

/**
 * Uploads one audio chunk straight to Blob Storage with a short lived,
 * write-only SAS. Audio bytes never pass through the API.
 */
export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  fileUri: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const target = await requestUploadUrl(sessionId, chunkIndex);

  const task = new UploadTask(new File(fileUri), target.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-blob-content-type': 'audio/mp4',
    },
    onProgress: onProgress
      ? ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) {
            onProgress(bytesSent / totalBytes);
          }
        }
      : undefined,
  });

  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`청크 ${chunkIndex} 업로드 실패 (${result.status}): ${result.body}`);
  }
}
