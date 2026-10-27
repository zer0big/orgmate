import type { SummaryArtifact, TemplateColumn, TemplateField } from '../api/client';

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function columnsFor(field: TemplateField, rows: Record<string, unknown>[]): TemplateColumn[] {
  if (field.columns?.length) {
    return field.columns;
  }
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return [...keys].map((key) => ({ key, label: key }));
}

function renderField(field: TemplateField, value: unknown): string | undefined {
  if (field.type === 'list') {
    const items = Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
    return items.length ? items.map((item) => `  • ${item}`).join('\n') : undefined;
  }

  if (field.type === 'table') {
    const rows = (Array.isArray(value) ? value : []).filter(
      (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
    );
    const columns = columnsFor(field, rows);
    const blocks = rows
      .map((row) => {
        const lines = columns
          .map((column) => {
            const cell = asText(row[column.key]);
            return cell ? `    ${column.label}: ${cell}` : undefined;
          })
          .filter(Boolean);
        return lines.length ? lines.join('\n') : undefined;
      })
      .filter(Boolean) as string[];
    return blocks.length
      ? blocks.map((block, index) => `  ${index + 1}.\n${block}`).join('\n')
      : undefined;
  }

  const text = asText(value);
  return text ? `  ${text}` : undefined;
}

/**
 * Builds a plain-text version of a summary for the share sheet. Markdown syntax
 * is stripped because most targets (mail, chat, notes) paste it verbatim.
 */
export function toPlainText(artifact: SummaryArtifact, sessionTitle: string): string {
  const header = [
    `[${artifact.templateName}] ${sessionTitle}`,
    new Date(artifact.createdAt).toLocaleString('ko-KR'),
    '',
  ];

  const body = artifact.fields
    .map((field) => {
      const rendered = renderField(field, artifact.data[field.key]);
      return rendered ? `${field.label}\n${rendered}` : undefined;
    })
    .filter(Boolean) as string[];

  return [...header, ...body, '', '— OrgMate'].join('\n');
}
