import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { describeConfig } from '../config.js';

export async function health(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Health probe received');

  return {
    status: 200,
    jsonBody: {
      status: 'ok',
      service: 'orgmate-api',
      version: '0.1.0',
      runtime: process.version,
      settings: describeConfig(),
      timestamp: new Date().toISOString(),
    },
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health,
});
