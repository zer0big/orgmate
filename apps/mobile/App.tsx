import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from './src/auth/useAuth';
import { useChunkedRecorder, type RecordedChunk } from './src/audio/useChunkedRecorder';
import { CHUNK_SECONDS } from './src/audio/recordingOptions';
import {
  completeSession,
  createSession,
  listSessions,
  uploadChunk,
  type Session,
} from './src/api/client';

function formatDuration(totalSeconds: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    pad(Math.floor(totalSeconds / 3600)),
    pad(Math.floor((totalSeconds % 3600) / 60)),
    pad(totalSeconds % 60),
  ].join(':');
}

function SignInScreen({ onSignIn, error }: { onSignIn: () => void; error?: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>OrgMate</Text>
      <Text style={styles.subtitle}>회의를 녹음하고 템플릿에 맞춰 자동으로 정리한다.</Text>
      <Pressable style={[styles.button, styles.buttonStart]} onPress={onSignIn}>
        <Text style={styles.buttonLabel}>조직 계정으로 로그인</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function RecorderScreen({
  displayName,
  onSignOut,
}: {
  displayName?: string;
  onSignOut: () => void;
}) {
  const [session, setSession] = useState<Session | undefined>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const sessionRef = useRef<Session | undefined>(undefined);
  const uploadsRef = useRef<Promise<unknown>[]>([]);

  const append = useCallback((line: string) => {
    setLog((previous) => [`${new Date().toLocaleTimeString()} ${line}`, ...previous].slice(0, 30));
  }, []);

  const onChunk = useCallback(
    (chunk: RecordedChunk) => {
      const current = sessionRef.current;
      if (!current) {
        return;
      }
      append(`청크 ${chunk.index} 업로드 시작`);
      const task = uploadChunk(current.id, chunk.index, chunk.uri)
        .then(() => append(`청크 ${chunk.index} 업로드 완료`))
        .catch((cause: unknown) => append(`청크 ${chunk.index} 업로드 실패: ${String(cause)}`));
      uploadsRef.current = [...uploadsRef.current, task];
    },
    [append],
  );

  const recorder = useChunkedRecorder(onChunk);

  const refresh = useCallback(async () => {
    try {
      const result = await listSessions();
      setSessions(result.sessions);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      append(`앱 상태 ${state}`);
    });
    return () => subscription.remove();
  }, [append]);

  const onStart = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      uploadsRef.current = [];
      const created = await createSession();
      sessionRef.current = created;
      setSession(created);
      append(`세션 생성 ${created.id.slice(0, 8)}`);
      await recorder.start(created.id);
      append('녹음 시작');
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [append, recorder]);

  const onStop = useCallback(async () => {
    setBusy(true);
    try {
      const elapsed = recorder.elapsedSeconds;
      const recorded = await recorder.stop();
      append('녹음 종료, 업로드 대기');
      await Promise.allSettled(uploadsRef.current);

      const current = sessionRef.current;
      if (current) {
        const updated = await completeSession(current.id, recorded.length, elapsed);
        setSession(updated);
        append(`세션 완료 (청크 ${recorded.length}개)`);
      }
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [append, recorder, refresh]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>OrgMate</Text>
        <Pressable onPress={onSignOut}>
          <Text style={styles.link}>로그아웃</Text>
        </Pressable>
      </View>
      {displayName ? <Text style={styles.meta}>{displayName}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.timer}>{formatDuration(recorder.elapsedSeconds)}</Text>
        <Text style={styles.meta}>
          {recorder.isRecording ? '녹음 중' : '정지'} · 청크 {recorder.chunks.length}개 · 분할{' '}
          {CHUNK_SECONDS / 60}분
        </Text>
        <Text style={styles.meta}>
          입력 레벨 {recorder.metering === undefined ? '-' : recorder.metering.toFixed(1)} dB
        </Text>
        <Text style={styles.meta}>
          네이티브 {recorder.nativeIsRecording ? '녹음중' : '정지'} ·{' '}
          {formatDuration(recorder.nativeDurationSeconds)} ·{' '}
          {(recorder.fileSize / 1024).toFixed(0)} KB
        </Text>
        {session ? <Text style={styles.meta}>세션 {session.id.slice(0, 8)}</Text> : null}
      </View>

      <Pressable
        disabled={busy}
        onPress={recorder.isRecording ? onStop : onStart}
        style={({ pressed }) => [
          styles.button,
          recorder.isRecording ? styles.buttonStop : styles.buttonStart,
          (pressed || busy) && styles.buttonPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonLabel}>{recorder.isRecording ? '녹음 중지' : '녹음 시작'}</Text>
        )}
      </Pressable>

      {recorder.error ? <Text style={styles.error}>{recorder.error}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>내 세션</Text>
      {sessions.length === 0 ? (
        <Text style={styles.meta}>아직 없음</Text>
      ) : (
        sessions.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.status} · 청크 {item.chunks.length}개
              {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ''}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>로그</Text>
      {log.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.logLine}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

export default function App() {
  const auth = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      {!auth.isReady ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : auth.isSignedIn ? (
        <RecorderScreen displayName={auth.displayName} onSignOut={auth.signOut} />
      ) : (
        <SignInScreen onSignIn={auth.signIn} error={auth.error} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  container: { padding: 24, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#101828' },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#475467', textAlign: 'center' },
  link: { fontSize: 14, color: '#1570EF', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  timer: { fontSize: 40, fontWeight: '700', color: '#101828', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: '#475467' },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonStart: { backgroundColor: '#1570EF' },
  buttonStop: { backgroundColor: '#D92D20' },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  error: { color: '#B42318', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#101828', marginTop: 10 },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  rowTitle: { fontWeight: '600', color: '#101828' },
  logLine: { fontSize: 11, color: '#667085' },
});
