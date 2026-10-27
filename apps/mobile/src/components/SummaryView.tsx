import { StyleSheet, Text, View } from 'react-native';
import type { SummaryArtifact, TemplateColumn, TemplateField } from '../api/client';

/** Rows produced for `table` fields are plain string maps keyed by column key. */
type TableRow = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

function asRows(value: unknown): TableRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (row): row is TableRow =>
      typeof row === 'object' && row !== null && Object.values(row).some((cell) => asText(cell)),
  );
}

/** Falls back to the row's own keys when the template did not ship column metadata. */
function columnsFor(field: TemplateField, rows: TableRow[]): TemplateColumn[] {
  if (field.columns?.length) {
    return field.columns;
  }
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return [...keys].map((key) => ({ key, label: key }));
}

function TextField({ value }: { value: string }) {
  return <Text style={styles.body}>{value}</Text>;
}

function ListField({ items }: { items: string[] }) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} style={styles.bulletRow}>
          <Text style={styles.bullet}>·</Text>
          <Text style={styles.body}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Renders each table row as a stacked label/value card. Pipe tables are unreadable
 * on a phone-width screen, so rows are expanded vertically instead.
 */
function TableField({ columns, rows }: { columns: TemplateColumn[]; rows: TableRow[] }) {
  return (
    <View style={styles.list}>
      {rows.map((row, index) => (
        <View key={index} style={styles.tableCard}>
          <Text style={styles.tableIndex}>{index + 1}</Text>
          {columns.map((column) => {
            const cell = asText(row[column.key]);
            if (!cell) {
              return null;
            }
            return (
              <View key={column.key} style={styles.cellRow}>
                <Text style={styles.cellLabel}>{column.label}</Text>
                <Text style={styles.cellValue}>{cell}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function SummaryView({ artifact }: { artifact: SummaryArtifact }) {
  const sections = artifact.fields
    .map((field) => {
      const value = artifact.data[field.key];
      if (field.type === 'list') {
        const items = asList(value);
        return items.length ? { field, node: <ListField items={items} /> } : undefined;
      }
      if (field.type === 'table') {
        const rows = asRows(value);
        return rows.length
          ? { field, node: <TableField columns={columnsFor(field, rows)} rows={rows} /> }
          : undefined;
      }
      const text = asText(value);
      return text ? { field, node: <TextField value={text} /> } : undefined;
    })
    .filter((section): section is { field: TemplateField; node: JSX.Element } => Boolean(section));

  return (
    <View style={styles.container}>
      <Text style={styles.badge}>
        {artifact.templateName} · {new Date(artifact.createdAt).toLocaleString('ko-KR')}
      </Text>
      {sections.length === 0 ? (
        <Text style={styles.body}>정리된 내용이 없다. 녹음이 너무 짧았을 수 있다.</Text>
      ) : (
        sections.map(({ field, node }) => (
          <View key={field.key} style={styles.section}>
            <Text style={styles.sectionLabel}>{field.label}</Text>
            {node}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 14,
    gap: 14,
    marginTop: 6,
  },
  badge: { fontSize: 11, color: '#667085', fontWeight: '600' },
  section: { gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#1570EF' },
  body: { fontSize: 13, lineHeight: 19, color: '#101828', flexShrink: 1 },
  list: { gap: 6 },
  bulletRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bullet: { fontSize: 13, lineHeight: 19, color: '#98A2B3' },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 10,
    gap: 4,
  },
  tableIndex: { fontSize: 10, fontWeight: '700', color: '#98A2B3' },
  cellRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cellLabel: { fontSize: 12, color: '#667085', width: 72 },
  cellValue: { fontSize: 13, lineHeight: 19, color: '#101828', flex: 1 },
});
