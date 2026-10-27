import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from './src/auth/useAuth';
import { useChunkedRecorder, type RecordedChunk } from './src/audio/useChunkedRecorder';
import { CHUNK_SECONDS } from './src/audio/recordingOptions';
import {
  archiveSession,
  completeSession,
  createSession,
  deleteSession,
  getSession,
  getSummary,
  listSessions,
  listTemplates,
  requestSummary,
  retranscribeSession,
  uploadChunk,
  type Session,
  type SummaryArtifact,
  type Template,
} from './src/api/client';
import { SummaryView } from './src/components/SummaryView';

const LOGO = require('./assets/logo.png');

/** How long to wait for a background worker before giving up. */
const POLL_INTERVAL_MS = 4000;
const POLL_ATTEMPTS = 150;

const STATUS_LABELS: Record<string, string> = {
  recording: '녹음 중',
  uploaded: '업로드 완료',
  transcribing: '전사 중',
  transcribed: '전사 완료',
  organizing: '정리 중',
  organized: '정리 완료',
  failed: '실패',
};

const BUSY_STATUSES = new Set(['uploaded', 'transcribing', 'organizing']);

/** A session that stopped progressing is treated as stalled, not as in-flight work. */
const STALL_AFTER_MS = 5 * 60 * 1000;

function isStalled(session: Session): boolean {
  if (!BUSY_STATUSES.has(session.status)) {
    return false;
  }
  return Date.now() - new Date(session.updatedAt).getTime() > STALL_AFTER_MS;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      <Image source={LOGO} style={styles.logoLarge} resizeMode="contain" />
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('meeting-minutes');
  const [summaries, setSummaries] = useState<Record<string, SummaryArtifact>>({});
  const [openSummary, setOpenSummary] = useState<Record<string, boolean>>({});
  const [organizingId, setOrganizingId] = useState<string | undefined>();
  const [showArchived, setShowArchived] = useState(false);
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
      const result = await listSessions(showArchived);
      setSessions(result.sessions);
    } catch (cause) {
      setError(String(cause));
    }
  }, [showArchived]);

  /** Polls until a background worker moves the session to one of the targets. */
  const waitForStatus = useCallback(
    async (sessionId: string, targets: string[], label: string): Promise<Session | undefined> => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await delay(POLL_INTERVAL_MS);

        let latest: Session;
        try {
          latest = await getSession(sessionId);
        } catch (cause) {
          append(`상태 조회 실패: ${String(cause)}`);
          continue;
        }

        setSessions((previous) =>
          previous.map((item) => (item.id === sessionId ? latest : item)),
        );
        if (sessionRef.current?.id === sessionId) {
          setSession(latest);
        }

        if (targets.includes(latest.status)) {
          append(`${label} 완료`);
          return latest;
        }
        if (latest.status === 'failed') {
          append(`${label} 실패: ${latest.error ?? '알 수 없는 오류'}`);
          return latest;
        }
      }

      append(`${label}가 예상보다 오래 걸린다.`);
      return undefined;
    },
    [append],
  );

  const onOrganize = useCallback(
    async (target: Session) => {
      setError(undefined);
      setOrganizingId(target.id);
      const template = templates.find((item) => item.id === templateId);
      append(`정리 요청: ${target.title} · ${template?.name ?? templateId}`);

      try {
        const queued = await requestSummary(target.id, templateId);
        setSessions((previous) =>
          previous.map((item) => (item.id === target.id ? queued : item)),
        );

        const done = await waitForStatus(target.id, ['organized'], '정리');
        if (done?.status !== 'organized') {
          return;
        }

        const artifact = await getSummary(target.id, templateId);
        setSummaries((previous) => ({ ...previous, [target.id]: artifact }));
        setOpenSummary((previous) => ({ ...previous, [target.id]: true }));
      } catch (cause) {
        setError(String(cause));
      } finally {
        setOrganizingId(undefined);
      }
    },
    [append, templateId, templates, waitForStatus],
  );

  const onShowSummary = useCallback(
    async (target: Session) => {
      const isOpen = openSummary[target.id];
      setOpenSummary((previous) => ({ ...previous, [target.id]: !isOpen }));
      if (isOpen || summaries[target.id]) {
        return;
      }

      const saved = target.summaries?.[target.summaries.length - 1];
      if (!saved) {
        return;
      }
      try {
        const artifact = await getSummary(target.id, saved.templateId);
        setSummaries((previous) => ({ ...previous, [target.id]: artifact }));
      } catch (cause) {
        setError(String(cause));
      }
    },
    [openSummary, summaries],
  );

  const onRetranscribe = useCallback(
    async (target: Session) => {
      setError(undefined);
      append(`전사 재시작: ${target.title}`);
      try {
        const queued = await retranscribeSession(target.id);
        setSessions((previous) =>
          previous.map((item) => (item.id === target.id ? queued : item)),
        );
        void waitForStatus(target.id, ['transcribed', 'organized'], '전사');
      } catch (cause) {
        setError(String(cause));
      }
    },
    [append, waitForStatus],
  );

  const onArchive = useCallback(
    async (target: Session) => {
      const archived = !target.archivedAt;
      try {
        await archiveSession(target.id, archived);
        append(`${target.title} ${archived ? '보관함으로 이동' : '보관 해제'}`);
        await refresh();
      } catch (cause) {
        setError(String(cause));
      }
    },
    [append, refresh],
  );

  const onDelete = useCallback(
    (target: Session) => {
      Alert.alert(
        '세션 삭제',
        `"${target.title}"의 녹음 파일, 전사본, 정리본을 모두 영구 삭제한다. 되돌릴 수 없다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await deleteSession(target.id);
                  append(`${target.title} 삭제 완료`);
                  setSessions((previous) => previous.filter((item) => item.id !== target.id));
                } catch (cause) {
                  setError(String(cause));
                }
              })();
            },
          },
        ],
      );
    },
    [append],
  );

  const onShare = useCallback(
    async (target: Session) => {
      try {
        let artifact = summaries[target.id];
        if (!artifact) {
          const saved = target.summaries?.[target.summaries.length - 1];
          if (!saved) {
            return;
          }
          artifact = await getSummary(target.id, saved.templateId);
          setSummaries((previous) => ({ ...previous, [target.id]: artifact }));
        }
        await Share.share({
          title: `${target.title} · ${artifact.templateName}`,
          message: artifact.markdown,
        });
      } catch (cause) {
        setError(String(cause));
      }
    },
    [summaries],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listTemplates()
      .then((result) => setTemplates(result.templates))
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

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
        append(`세션 완료 (청크 ${recorded.length}개) · 전사 대기`);
        await refresh();
        void waitForStatus(current.id, ['transcribed', 'organized'], '전사');
      } else {
        await refresh();
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [append, recorder, refresh, waitForStatus]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.title}>OrgMate</Text>
            {displayName ? <Text style={styles.brandMeta}>{displayName}</Text> : null}
          </View>
        </View>
        <Pressable onPress={onSignOut}>
          <Text style={styles.link}>로그아웃</Text>
        </Pressable>
      </View>

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
        {session ? (
          <Text style={styles.meta}>
            세션 {session.id.slice(0, 8)} · {statusLabel(session.status)}
          </Text>
        ) : null}
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

      <Text style={styles.sectionTitle}>정리 템플릿</Text>
      <View style={styles.chipRow}>
        {templates.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setTemplateId(item.id)}
            style={[styles.chip, templateId === item.id && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, templateId === item.id && styles.chipLabelActive]}>
              {item.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.meta}>
        {templates.find((item) => item.id === templateId)?.description ?? ''}
      </Text>
      <Text style={styles.hint}>
        선택한 템플릿은 아래에서 "정리"를 누른 세션 하나에만 적용된다. 세션은 각각 따로 정리된다.
      </Text>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>내 세션</Text>
        <Pressable onPress={() => setShowArchived((previous) => !previous)}>
          <Text style={styles.link}>{showArchived ? '활성만 보기' : '보관함 포함'}</Text>
        </Pressable>
      </View>
      {sessions.length === 0 ? (
        <Text style={styles.meta}>아직 없음</Text>
      ) : (
        sessions.map((item) => {
          const stalled = isStalled(item);
          const working = BUSY_STATUSES.has(item.status) && !stalled;
          const isOrganizing = organizingId === item.id;
          const canOrganize = item.status === 'transcribed' || item.status === 'organized';
          const canTranscribe =
            item.chunks.length > 0 && (stalled || item.status === 'failed');
          const artifact = summaries[item.id];
          const hasSummary = (item.summaries?.length ?? 0) > 0;
          return (
            <View key={item.id} style={[styles.row, isOrganizing && styles.rowActive]}>
              <Text style={styles.rowTitle}>
                {item.archivedAt ? '[보관] ' : ''}
                {item.title}
              </Text>
              <View style={styles.statusRow}>
                {working ? <ActivityIndicator size="small" color="#1570EF" /> : null}
                <Text style={styles.meta}>
                  {stalled ? '중단됨' : statusLabel(item.status)} · 청크 {item.chunks.length}개
                  {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ''}
                  {item.speakerCount ? ` · 화자 ${item.speakerCount}명` : ''}
                </Text>
              </View>
              {item.summaries?.length ? (
                <Text style={styles.meta}>
                  정리본 {item.summaries.map((entry) => entry.templateName).join(', ')}
                </Text>
              ) : null}
              {item.transcriptPreview ? (
                <Text style={styles.preview} numberOfLines={3}>
                  {item.transcriptPreview}
                </Text>
              ) : null}
              {item.error ? <Text style={styles.error}>{item.error}</Text> : null}

              <View style={styles.actionRow}>
                {canTranscribe ? (
                  <Pressable
                    onPress={() => void onRetranscribe(item)}
                    style={[styles.smallButton, styles.buttonStart]}
                  >
                    <Text style={styles.smallButtonLabel}>전사 시작</Text>
                  </Pressable>
                ) : null}
                {canOrganize ? (
                  <Pressable
                    disabled={organizingId !== undefined}
                    onPress={() => void onOrganize(item)}
                    style={[
                      styles.smallButton,
                      styles.buttonStart,
                      organizingId !== undefined && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.smallButtonLabel}>
                      {isOrganizing
                        ? '정리 중...'
                        : `이 세션 정리 · ${
                            templates.find((entry) => entry.id === templateId)?.name ?? templateId
                          }`}
                    </Text>
                  </Pressable>
                ) : null}
                {hasSummary ? (
                  <Pressable
                    onPress={() => void onShowSummary(item)}
                    style={[styles.smallButton, styles.smallButtonGhost]}
                  >
                    <Text style={styles.smallButtonGhostLabel}>
                      {openSummary[item.id] ? '결과 접기' : '결과 보기'}
                    </Text>
                  </Pressable>
                ) : null}
                {hasSummary ? (
                  <Pressable
                    onPress={() => void onShare(item)}
                    style={[styles.smallButton, styles.smallButtonGhost]}
                  >
                    <Text style={styles.smallButtonGhostLabel}>공유 / 내보내기</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void onArchive(item)}
                  style={[styles.smallButton, styles.smallButtonGhost]}
                >
                  <Text style={styles.smallButtonGhostLabel}>
                    {item.archivedAt ? '보관 해제' : '보관'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onDelete(item)}
                  style={[styles.smallButton, styles.smallButtonDanger]}
                >
                  <Text style={styles.smallButtonDangerLabel}>삭제</Text>
                </Pressable>
              </View>

              {openSummary[item.id] && artifact ? <SummaryView artifact={artifact} /> : null}
            </View>
          );
        })
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 46, height: 28 },
  logoLarge: { width: 160, height: 76 },
  brandMeta: { fontSize: 12, color: '#667085' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
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
  rowActive: { borderColor: '#1570EF', borderWidth: 2 },
  hint: { fontSize: 12, color: '#667085', lineHeight: 17 },
  preview: { fontSize: 12, color: '#344054', lineHeight: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#1570EF', borderColor: '#1570EF' },
  chipLabel: { fontSize: 13, color: '#344054', fontWeight: '500' },
  chipLabelActive: { color: '#FFFFFF' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  smallButton: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  smallButtonLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  smallButtonGhost: { backgroundColor: '#EFF4FF' },
  smallButtonGhostLabel: { color: '#1570EF', fontSize: 13, fontWeight: '600' },
  smallButtonDanger: { backgroundColor: '#FEF3F2' },
  smallButtonDangerLabel: { color: '#B42318', fontSize: 13, fontWeight: '600' },
  logLine: { fontSize: 11, color: '#667085' },
});
