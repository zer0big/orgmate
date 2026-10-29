import { templatesContainer } from './cosmos.js';
import {
  SummaryTemplate,
  TemplateField,
  TemplateFieldType,
  SYSTEM_TEMPLATES,
} from '../templates/systemTemplates.js';

const VALID_FIELD_TYPES = new Set<TemplateFieldType>(['text', 'list', 'table']);
const MAX_FIELDS = 20;

export interface CustomTemplateDocument {
  id: string;
  userId: string;
  type: 'custom-template';
  template: SummaryTemplate;
  updatedAt: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'custom-template';
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function sanitizeField(field: unknown): TemplateField | undefined {
  if (!field || typeof field !== 'object') {
    return undefined;
  }

  const candidate = field as Record<string, unknown>;
  const key = normalizeText(candidate.key, '').replace(/\s+/g, '-');
  const label = normalizeText(candidate.label, '새 필드');
  const type = candidate.type === 'text' || candidate.type === 'list' || candidate.type === 'table'
    ? candidate.type as TemplateFieldType
    : undefined;
  const guidance = normalizeText(candidate.guidance, '필드를 정리한다.');

  if (!key || !type || !VALID_FIELD_TYPES.has(type)) {
    return undefined;
  }

  const columns = Array.isArray(candidate.columns)
    ? candidate.columns
        .map((column) => {
          if (!column || typeof column !== 'object') {
            return undefined;
          }

          const item = column as Record<string, unknown>;
          const keyName = normalizeText(item.key, '').replace(/\s+/g, '-');
          const labelName = normalizeText(item.label, '열');
          return keyName ? { key: keyName, label: labelName } : undefined;
        })
        .filter((column): column is { key: string; label: string } => Boolean(column))
        .slice(0, 10)
    : [];

  return {
    key,
    label,
    type,
    guidance,
    ...(type === 'table' && columns.length > 0 ? { columns } : {}),
  };
}

export function sanitizeTemplateInput(input: unknown): SummaryTemplate {
  const candidate = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  const rawId = normalizeText(candidate.id, 'custom-template');
  const id = slugify(rawId === 'custom-template' ? `custom-${Date.now()}` : rawId);
  const name = normalizeText(candidate.name, '새 템플릿');
  const description = normalizeText(candidate.description, '관리자가 만든 사용자 정의 템플릿입니다.');
  const persona = normalizeText(candidate.persona, '전문 분석가');
  const fields = Array.isArray(candidate.fields)
    ? candidate.fields
        .map((field) => sanitizeField(field))
        .filter((field): field is TemplateField => Boolean(field))
        .slice(0, MAX_FIELDS)
    : [];

  return {
    id,
    name,
    description,
    persona,
    fields,
  };
}

export function mergeTemplates(
  systemTemplates: SummaryTemplate[] = SYSTEM_TEMPLATES,
  customTemplates: SummaryTemplate[] = [],
): SummaryTemplate[] {
  const merged = new Map<string, SummaryTemplate>();

  for (const template of systemTemplates) {
    merged.set(template.id, template);
  }

  for (const template of customTemplates) {
    merged.set(template.id, template);
  }

  return [...merged.values()];
}

export async function readCustomTemplates(userId: string): Promise<SummaryTemplate[]> {
  const { resources } = await templatesContainer.items
    .query<CustomTemplateDocument>({
      query: `SELECT * FROM c WHERE c.type = @type AND c.userId = @userId ORDER BY c.updatedAt DESC`,
      parameters: [
        { name: '@type', value: 'custom-template' },
        { name: '@userId', value: userId },
      ],
    })
    .fetchAll();

  return resources.map((resource) => resource.template).filter(Boolean);
}

export async function saveCustomTemplate(
  userId: string,
  input: unknown,
): Promise<SummaryTemplate> {
  const template = sanitizeTemplateInput(input);
  if (template.fields.length === 0) {
    throw new Error('A template must contain at least one field');
  }

  const document: CustomTemplateDocument = {
    id: template.id,
    userId,
    type: 'custom-template',
    template,
    updatedAt: new Date().toISOString(),
  };

  await templatesContainer.items.upsert(document);
  return template;
}

export async function deleteCustomTemplate(userId: string, templateId: string): Promise<boolean> {
  try {
    const existing = await templatesContainer.item(templateId, userId).read<CustomTemplateDocument>();
    if (!existing.resource || existing.resource.type !== 'custom-template') {
      return false;
    }
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return false;
    }
    throw error;
  }

  await templatesContainer.item(templateId, userId).delete();
  return true;
}
