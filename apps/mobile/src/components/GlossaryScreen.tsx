import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GlossaryTerm, listTerms, replaceTerms } from '../api/client';
import { Theme } from '../theme/theme';
import { useTheme } from '../theme/useTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function parseAliases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Terms registered here are sent to Speech as a recognition bias before
 * transcription, and any listed mis-spelling is rewritten afterwards.
 */
export function GlossaryScreen({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [text, setText] = useState('');
  const [aliases, setAliases] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTerms();
      setTerms(result.terms);
    } catch (e) {
      setError(e instanceof Error ? e.message : '용어를 불러오지 못했다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void load();
    }
  }, [visible, load]);

  const persist = useCallback(async (next: GlossaryTerm[]) => {
    setSaving(true);
    setError(null);
    try {
      const result = await replaceTerms(next);
      setTerms(result.terms);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했다.');
    } finally {
      setSaving(false);
    }
  }, []);

  const onAdd = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const next = [
      { text: trimmed, aliases: parseAliases(aliases) },
      ...terms.filter((term) => term.text !== trimmed),
    ];
    setText('');
    setAliases('');
    void persist(next);
  }, [text, aliases, terms, persist]);

  const onRemove = useCallback(
    (target: string) => {
      void persist(terms.filter((term) => term.text !== target));
    },
    [terms, persist],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.head}>
          <Text style={styles.title}>용어 사전</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>닫기</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          등록한 용어는 전사할 때 우선 인식되고, 잘못 들린 표기는 자동으로 교정된다.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="정확한 표기 (예: 삼성전기 인도법인)"
            placeholderTextColor={theme.textMuted}
          />
          <TextInput
            style={styles.input}
            value={aliases}
            onChangeText={setAliases}
            placeholder="잘못 들리는 표기, 쉼표로 구분 (예: 인도보비)"
            placeholderTextColor={theme.textMuted}
          />
          <Pressable
            style={[styles.addButton, (!text.trim() || saving) && styles.dimmed]}
            onPress={onAdd}
            disabled={!text.trim() || saving}
          >
            <Text style={styles.addLabel}>{saving ? '저장 중' : '추가'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={theme.accent} style={styles.loader} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {terms.map((term) => (
              <View key={term.text} style={styles.row}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{term.text}</Text>
                  {term.aliases.length > 0 ? (
                    <Text style={styles.rowAliases}>{term.aliases.join(', ')}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => onRemove(term.text)} hitSlop={10} disabled={saving}>
                  <Text style={styles.remove}>삭제</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, paddingTop: 56, gap: 14 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.4 },
    close: { fontSize: 15, color: theme.accent, fontWeight: '600' },
    hint: { fontSize: 13, color: theme.textMuted, lineHeight: 19 },
    form: { gap: 10 },
    input: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.text,
    },
    addButton: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    addLabel: { color: theme.accentOn, fontSize: 15, fontWeight: '700' },
    dimmed: { opacity: 0.45 },
    error: { fontSize: 13, color: theme.danger },
    loader: { marginTop: 24 },
    list: { gap: 10, paddingVertical: 8, paddingBottom: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowBody: { flex: 1, gap: 3 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: theme.text },
    rowAliases: { fontSize: 12.5, color: theme.textMuted },
    remove: { fontSize: 13, color: theme.danger, fontWeight: '600' },
  });
}
