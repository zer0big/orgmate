import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'node:crypto';
import { getUser } from '../auth.js';
import { createUploadSas, downloadJson } from '../services/storage.js';
import { SessionDocument, sessionsContainer } from '../services/cosmos.js';
import { enqueueTranscribeJob } from '../services/queue.js';

const AUDIO_CONTAINER = 'audio';
const TRANSCRIPT_CONTAINER = 'transcripts';

function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { error: 'Unauthorized' } };
}

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function chunkBlobPath(userId: string, sessionId: string, index: number): string {
  return `${userId}/${sessionId}/chunk-${String(index).padStart(4, '0')}.m4a`;
}

async function readSession(userId: string, sessionId: string): Promise<SessionDocument | undefined> {
  try {
    const { resource } = await sessionsContainer.item(sessionId, userId).read<SessionDocument>();
    return resource;
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return undefined;
    }
    throw error;
  }
}

async function createSession(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const now = new Date().toISOString();
  const session: SessionDocument = {
    id: randomUUID(),
    userId: user.userId,
    title: body.title?.trim() || `녹음 ${now.slice(0, 16).replace('T', ' ')}`,
    status: 'recording',
    createdAt: now,
    updatedAt: now,
    chunks: [],
  };

  await sessionsContainer.items.create(session);
  context.log(`Created session ${session.id}`);

  return { status: 201, jsonBody: session };
}

async function listSessions(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const { resources } = await sessionsContainer.items
    .query<SessionDocument>({
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: user.userId }],
    })
    .fetchAll();

  return { status: 200, jsonBody: { sessions: resources } };
}

async function getSession(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const sessionId = request.params.sessionId;
  if (!sessionId) {
    return badRequest('sessionId is required');
  }

  const session = await readSession(user.userId, sessionId);
  if (!session) {
    return { status: 404, jsonBody: { error: 'Session not found' } };
  }

  return { status: 200, jsonBody: session };
}

async function createUploadUrl(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const sessionId = request.params.sessionId;
  if (!sessionId) {
    return badRequest('sessionId is required');
  }

  const session = await readSession(user.userId, sessionId);
  if (!session) {
    return { status: 404, jsonBody: { error: 'Session not found' } };
  }

  const body = (await request.json().catch(() => ({}))) as { chunkIndex?: number };
  const chunkIndex = body.chunkIndex;
  if (!Number.isInteger(chunkIndex) || (chunkIndex as number) < 0) {
    return badRequest('chunkIndex must be a non-negative integer');
  }

  const target = await createUploadSas(
    AUDIO_CONTAINER,
    chunkBlobPath(user.userId, sessionId, chunkIndex as number),
  );

  return { status: 200, jsonBody: target };
}

async function completeSession(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const sessionId = request.params.sessionId;
  if (!sessionId) {
    return badRequest('sessionId is required');
  }

  const session = await readSession(user.userId, sessionId);
  if (!session) {
    return { status: 404, jsonBody: { error: 'Session not found' } };
  }

  const body = (await request.json().catch(() => ({}))) as {
    chunkCount?: number;
    durationSeconds?: number;
  };

  if (!Number.isInteger(body.chunkCount) || (body.chunkCount as number) < 1) {
    return badRequest('chunkCount must be a positive integer');
  }

  const chunkCount = body.chunkCount as number;
  session.chunks = Array.from({ length: chunkCount }, (_, index) => ({
    index,
    blobPath: chunkBlobPath(user.userId, sessionId, index),
  }));
  session.durationSeconds = body.durationSeconds;
  session.status = 'uploaded';
  session.updatedAt = new Date().toISOString();

  await sessionsContainer.item(sessionId, user.userId).replace(session);
  context.log(`Session ${sessionId} uploaded with ${chunkCount} chunk(s)`);

  await enqueueTranscribeJob({ userId: user.userId, sessionId });
  context.log(`Queued transcription for session ${sessionId}`);

  return { status: 200, jsonBody: session };
}

async function getTranscript(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const sessionId = request.params.sessionId;
  if (!sessionId) {
    return badRequest('sessionId is required');
  }

  const session = await readSession(user.userId, sessionId);
  if (!session) {
    return { status: 404, jsonBody: { error: 'Session not found' } };
  }
  if (!session.transcriptBlobPath) {
    return {
      status: 409,
      jsonBody: { error: 'Transcript is not ready yet', status: session.status },
    };
  }

  const transcript = await downloadJson(TRANSCRIPT_CONTAINER, session.transcriptBlobPath);
  return { status: 200, jsonBody: transcript };
}

app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: createSession,
});

app.http('listSessions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions',
  handler: listSessions,
});

app.http('getSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}',
  handler: getSession,
});

app.http('createUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/upload-url',
  handler: createUploadUrl,
});

app.http('completeSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/complete',
  handler: completeSession,
});

app.http('getTranscript', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sessions/{sessionId}/transcript',
  handler: getTranscript,
});
