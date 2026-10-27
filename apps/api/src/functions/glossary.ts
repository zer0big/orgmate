import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { getUser } from '../auth.js';
import { MAX_TERMS, readGlossary, sanitizeTerms, saveGlossary } from '../services/glossary.js';

function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { error: 'Unauthorized' } };
}

async function listTerms(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const terms = await readGlossary(user.userId);
  return { status: 200, jsonBody: { terms, maxTerms: MAX_TERMS } };
}

/** Replaces the whole glossary; the client always sends the full list. */
async function replaceTerms(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as { terms?: unknown };
  const terms = sanitizeTerms(body.terms);
  await saveGlossary(user.userId, terms);

  return { status: 200, jsonBody: { terms, maxTerms: MAX_TERMS } };
}

app.http('listTerms', {
  route: 'terms',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: listTerms,
});

app.http('replaceTerms', {
  route: 'terms',
  methods: ['PUT'],
  authLevel: 'anonymous',
  handler: replaceTerms,
});
