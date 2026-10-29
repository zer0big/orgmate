import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { getUser } from '../auth.js';
import {
  deleteCustomTemplate,
  mergeTemplates,
  readCustomTemplates,
  sanitizeTemplateInput,
  saveCustomTemplate,
} from '../services/templateCatalog.js';
import { SYSTEM_TEMPLATES } from '../templates/systemTemplates.js';

function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { error: 'Unauthorized' } };
}

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

async function listTemplates(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const customTemplates = await readCustomTemplates(user.userId);
  const templates = mergeTemplates(SYSTEM_TEMPLATES, customTemplates).map(
    ({ id, name, description, fields }) => ({
      id,
      name,
      description,
      fields: fields.map(({ key, label, type }) => ({ key, label, type })),
    }),
  );

  return { status: 200, jsonBody: { templates } };
}

async function createTemplate(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const template = await saveCustomTemplate(user.userId, body);
    return { status: 201, jsonBody: { template } };
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid template payload');
  }
}

async function updateTemplate(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const templateId = request.params.templateId;
  if (!templateId) {
    return badRequest('templateId is required');
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const template = sanitizeTemplateInput({ ...body, id: templateId });

  try {
    const saved = await saveCustomTemplate(user.userId, template);
    return { status: 200, jsonBody: { template: saved } };
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid template payload');
  }
}

async function deleteTemplate(request: HttpRequest): Promise<HttpResponseInit> {
  const user = getUser(request);
  if (!user) {
    return unauthorized();
  }

  const templateId = request.params.templateId;
  if (!templateId) {
    return badRequest('templateId is required');
  }

  const deleted = await deleteCustomTemplate(user.userId, templateId);
  if (!deleted) {
    return { status: 404, jsonBody: { error: 'Template not found' } };
  }

  return { status: 200, jsonBody: { deleted: true, templateId } };
}

app.http('listTemplates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: listTemplates,
});

app.http('createTemplate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: createTemplate,
});

app.http('updateTemplate', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: updateTemplate,
});

app.http('deleteTemplate', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: deleteTemplate,
});
