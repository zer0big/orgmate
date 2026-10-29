import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SummaryArtifact, TemplateColumn, TemplateField } from '../api/client';
import { useTheme } from '../theme/useTheme';
import type { Theme } from '../theme/theme';

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

export function SummaryView({ artifact }: { artifact: SummaryArtifact }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const sections: Array<{ field: TemplateField; node: ReactNode }> = [];

  for (const field of artifact.fields) {
    const value = artifact.data[field.key];

    if (field.type === 'list') {
      const items = asList(value);
      if (!items.length) {
        continue;
      }
      sections.push({
        field,
        node: (
          <View style={styles.list}>
            {items.map((item, index) => (
              <View key={`${index}-${item}`} style={styles.bulletRow}>
                <View style={styles.dot} />
                <Text style={styles.body}>{item}</Text>
              </View>
            ))}
          </View>
        ),
      });
      continue;
    }

    if (field.type === 'table') {
      const rows = asRows(value);
      if (!rows.length) {
        continue;
      }
      const columns = columnsFor(field, rows);
      sections.push({
        field,
        node: (
          <View style={styles.list}>
            {rows.map((row, index) => (
              <View key={index} style={styles.tableCard}>
                {columns.map((column, columnIndex) => {
                  const cell = asText(row[column.key]);
                  if (!cell) {
                    return null;
                  }
                  return (
                    <Text
                      key={column.key}
                      style={columnIndex === 0 ? styles.cellLead : styles.cellValue}
                    >
                      {columnIndex === 0 ? cell : `${column.label} · ${cell}`}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        ),
      });
      continue;
    }

    const text = asText(value);
    if (text) {
      sections.push({ field, node: <Text style={styles.body}>{text}</Text> });
    }
  }

  return (
    <View style={styles.container}>
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 18,
      marginTop: 10,
    },
    section: { gap: 8 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.accent,
      letterSpacing: 0.6,
    },
    body: { fontSize: 14, lineHeight: 21, color: theme.text, flexShrink: 1 },
    list: { gap: 8 },
    bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.textMuted,
      marginTop: 8,
    },
    tableCard: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 4,
    },
    cellLead: { fontSize: 14, fontWeight: '600', lineHeight: 20, color: theme.text },
    cellValue: { fontSize: 13, lineHeight: 19, color: theme.textMuted },
  });
}
