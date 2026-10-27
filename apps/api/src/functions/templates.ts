import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { getUser } from '../auth.js';
import { SYSTEM_TEMPLATES } from '../templates/systemTemplates.js';

async function listTemplates(request: HttpRequest): Promise<HttpResponseInit> {
  if (!getUser(request)) {
    return { status: 401, jsonBody: { error: 'Unauthorized' } };
  }

  return {
    status: 200,
    jsonBody: {
      templates: SYSTEM_TEMPLATES.map(({ id, name, description, fields }) => ({
        id,
        name,
        description,
        fields: fields.map(({ key, label, type }) => ({ key, label, type })),
      })),
    },
  };
}

app.http('listTemplates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: listTemplates,
});
