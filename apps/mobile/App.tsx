import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getAccessToken, useAuth } from './src/auth/useAuth';
import { useChunkedRecorder, type RecordedChunk } from './src/audio/useChunkedRecorder';
import { config } from './src/config';
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
import { GlossaryScreen } from './src/components/GlossaryScreen';
import { toPlainText } from './src/export/summaryText';
import { ThemeProvider, useTheme } from './src/theme/useTheme';
import { THEMES, type Theme } from './src/theme/theme';

const LOGO = require('./assets/logo.png');

/** SafeAreaView does not reserve the Android status bar, so the header needs the inset. */
const STATUS_BAR_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

/** How long to wait for a background worker before giving up. */
const POLL_INTERVAL_MS = 4000;
const POLL_ATTEMPTS = 150;

/** Telling the service the real headcount stops diarization from inventing speakers. */
const SPEAKER_CHOICES = [1, 2, 3, 4, 5, 6];
const MAX_SPEAKER_CHOICE = SPEAKER_CHOICES[SPEAKER_CHOICES.length - 1];

const STATUS_LABELS: Record<string, string> = {
  recording: '녹음 중',
  uploaded: '전사 대기',
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(totalSeconds: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(totalSeconds / 3600);
  const body = [pad(Math.floor((totalSeconds % 3600) / 60)), pad(totalSeconds % 60)].join(':');
  return hours > 0 ? `${pad(hours)}:${body}` : body;
}

/** Normalises the dBFS meter reading into a 0..1 bar width. */
function meterRatio(metering?: number): number {
  if (metering === undefined) {
    return 0;
  }
  return Math.max(0, Math.min(1, (metering + 60) / 60));
}

function Brand({ styles }: { styles: AppStyles }) {
  return (
    <View style={styles.brand}>
      <Text style={styles.brandName}>OrgMate</Text>
      <Text style={styles.brandTagline}>녹음하고, 한 번에 정리한다</Text>
    </View>
  );
}

/** Quiet brand mark that closes the page instead of competing with the wordmark. */
function FooterBrand({ styles }: { styles: AppStyles }) {
  return (
    <View style={styles.footerBrand}>
      <View style={styles.footerLine} />
      <Image source={LOGO} style={styles.footerLogo} resizeMode="contain" />
    </View>
  );
}

function StatusPill({
  styles,
  theme,
  label,
  tone,
  spinning,
}: {
  styles: AppStyles;
  theme: Theme;
  label: string;
  tone: 'accent' | 'muted' | 'danger';
  spinning?: boolean;
}) {
  const toneStyle =
    tone === 'accent' ? styles.pillAccent : tone === 'danger' ? styles.pillDanger : styles.pillMuted;
  const labelStyle =
    tone === 'accent'
      ? styles.pillAccentLabel
      : tone === 'danger'
        ? styles.pillDangerLabel
        : styles.pillMutedLabel;
  return (
    <View style={[styles.pill, toneStyle]}>
      {spinning ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      <Text style={labelStyle}>{label}</Text>
    </View>
  );
}

function SettingsSheet({
  visible,
  onClose,
  styles,
  showDetails,
  onToggleDetails,
  onOpenGlossary,
  onRunAdminCheck,
  onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  styles: AppStyles;
  showDetails: boolean;
  onToggleDetails: () => void;
  onOpenGlossary: () => void;
  onRunAdminCheck: () => void;
  onSignOut: () => void;
}) {
  const { theme, setThemeId } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>배경 테마</Text>
          <View style={styles.swatchRow}>
            {THEMES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setThemeId(item.id)}
                style={styles.swatchCell}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: item.bg, borderColor: item.border },
                    theme.id === item.id && styles.swatchActive,
                  ]}
                >
                  <View style={[styles.swatchDot, { backgroundColor: item.accent }]} />
                </View>
                <Text style={[styles.swatchName, theme.id === item.id && styles.swatchNameActive]}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sheetDivider} />

          <Pressable
            onPress={() => {
              onClose();
              onOpenGlossary();
            }}
            style={styles.sheetRow}
          >
            <Text style={styles.sheetRowLabel}>용어 사전</Text>
            <Text style={styles.sheetRowValue}>관리</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onClose();
              onRunAdminCheck();
            }}
            style={styles.sheetRow}
          >
            <Text style={styles.sheetRowLabel}>관리자 API 확인</Text>
            <Text style={styles.sheetRowValue}>실행</Text>
          </Pressable>
          <Pressable onPress={onToggleDetails} style={styles.sheetRow}>
            <Text style={styles.sheetRowLabel}>상세 정보 표시</Text>
            <Text style={styles.sheetRowValue}>{showDetails ? '켜짐' : '꺼짐'}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onClose();
              onSignOut();
            }}
            style={styles.sheetRow}
          >
            <Text style={styles.sheetRowDanger}>로그아웃</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SignInScreen({ onSignIn, error }: { onSignIn: () => void; error?: string }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.signIn}>
      <Image source={LOGO} style={styles.signInLogo} resizeMode="contain" />
      <Text style={styles.signInName}>OrgMate</Text>
      <Text style={styles.signInTagline}>녹음하고, 한 번에 정리한다.</Text>
      <Pressable style={[styles.primaryButton, styles.signInButton]} onPress={onSignIn}>
        <Text style={styles.primaryButtonLabel}>조직 계정으로 로그인</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function SessionCard({
  session,
  styles,
  theme,
  templateName,
  artifact,
  expanded,
  organizing,
  busyElsewhere,
  summaryOpen,
  onToggleExpand,
  onOrganize,
  onToggleSummary,
  onRetranscribe,
  onShare,
  onArchive,
  onDelete,
}: {
  session: Session;
  styles: AppStyles;
  theme: Theme;
  templateName: string;
  artifact?: SummaryArtifact;
  expanded: boolean;
  organizing: boolean;
  busyElsewhere: boolean;
  summaryOpen: boolean;
  onToggleExpand: () => void;
  onOrganize: () => void;
  onToggleSummary: () => void;
  onRetranscribe: () => void;
  onShare: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const stalled = isStalled(session);
  const working = BUSY_STATUSES.has(session.status) && !stalled;
  const canOrganize = session.status === 'transcribed' || session.status === 'organized';
  const canTranscribe = session.chunks.length > 0 && (stalled || session.status === 'failed');
  const hasSummary = (session.summaries?.length ?? 0) > 0;

  const meta = [
    session.durationSeconds ? formatDuration(session.durationSeconds) : undefined,
    session.speakerCount ? `화자 ${session.speakerCount}명` : undefined,
    session.summaries?.length
      ? session.summaries.map((entry) => entry.templateName).join(', ')
      : undefined,
  ].filter(Boolean);

  return (
    <View style={[styles.card, organizing && styles.cardActive]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <StatusPill
          styles={styles}
          theme={theme}
          label={stalled ? '중단됨' : (STATUS_LABELS[session.status] ?? session.status)}
          tone={stalled || session.status === 'failed' ? 'danger' : working ? 'accent' : 'muted'}
          spinning={working}
        />
      </View>

      {meta.length ? <Text style={styles.cardMeta}>{meta.join(' · ')}</Text> : null}

      {session.transcriptPreview ? (
        <Text style={styles.cardPreview} numberOfLines={2}>
          {session.transcriptPreview}
        </Text>
      ) : null}

      {session.error ? <Text style={styles.error}>{session.error}</Text> : null}

      <View style={styles.cardActions}>
        {canOrganize ? (
          <Pressable
            disabled={busyElsewhere}
            onPress={onOrganize}
            style={[styles.chipButton, styles.chipButtonFilled, busyElsewhere && styles.dimmed]}
          >
            <Text style={styles.chipButtonFilledLabel}>
              {organizing ? '정리 중...' : `${templateName}으로 정리`}
            </Text>
          </Pressable>
        ) : null}
        {canTranscribe ? (
          <Pressable onPress={onRetranscribe} style={[styles.chipButton, styles.chipButtonFilled]}>
            <Text style={styles.chipButtonFilledLabel}>전사 시작</Text>
          </Pressable>
        ) : null}
        {hasSummary ? (
          <Pressable onPress={onToggleSummary} style={styles.chipButton}>
            <Text style={styles.chipButtonLabel}>{summaryOpen ? '결과 접기' : '결과 보기'}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onToggleExpand} style={styles.chipButton}>
          <Text style={styles.chipButtonLabel}>{expanded ? '닫기' : '더보기'}</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.cardActions}>
          {hasSummary ? (
            <Pressable onPress={onShare} style={styles.chipButton}>
              <Text style={styles.chipButtonLabel}>공유</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onArchive} style={styles.chipButton}>
            <Text style={styles.chipButtonLabel}>
              {session.archivedAt ? '보관 해제' : '보관'}
            </Text>
          </Pressable>
          <Pressable onPress={onDelete} style={[styles.chipButton, styles.chipButtonDanger]}>
            <Text style={styles.chipButtonDangerLabel}>삭제</Text>
          </Pressable>
        </View>
      ) : null}

      {summaryOpen && artifact ? <SummaryView artifact={artifact} /> : null}
    </View>
  );
}

function RecorderScreen({ onSignOut }: { onSignOut: () => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [session, setSession] = useState<Session | undefined>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('meeting-minutes');
  const [summaries, setSummaries] = useState<Record<string, SummaryArtifact>>({});
  const [openSummary, setOpenSummary] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [organizingId, setOrganizingId] = useState<string | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [expectedSpeakers, setExpectedSpeakers] = useState(2);
  const [showDetails, setShowDetails] = useState(false);
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

        setSessions((previous) => previous.map((item) => (item.id === sessionId ? latest : item)));
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
        setSessions((previous) => previous.map((item) => (item.id === target.id ? queued : item)));

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

  const onToggleSummary = useCallback(
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
        setSessions((previous) => previous.map((item) => (item.id === target.id ? queued : item)));
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

  const runAdminApiCheck = useCallback(async () => {
    setError(undefined);
    append('관리자 API 확인 시작');

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('로그인 토큰이 없습니다.');
      }

      const candidates = [`${config.apiBaseUrl.replace(/\/+$/, '')}/manage`];

      let lastResponse: Response | undefined;
      let lastBody = '';

      for (const url of candidates) {
        append(`관리자 API 호출: ${url}`);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        lastResponse = response;
        lastBody = await response.text();
        append(`관리자 API 응답: ${response.status} ${url} ${lastBody.slice(0, 180)}`);

        if (response.ok) {
          Alert.alert('관리자 API 확인', `성공: ${response.status}\n${lastBody.slice(0, 200)}`);
          return;
        }

        if (response.status !== 404) {
          throw new Error(`관리자 API 실패 (${response.status}): ${lastBody}`);
        }
      }

      throw new Error(
        `관리자 API 실패 (${lastResponse?.status ?? 404}): 마지막 URL에 404가 발생했습니다. ${candidates.join(' / ')}`,
      );
    } catch (cause) {
      const message = String(cause);
      append(`관리자 API 확인 실패: ${message}`);
      setError(message);
    }
  }, [append]);

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
          message: toPlainText(artifact, target.title),
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
      const created = await createSession(undefined, expectedSpeakers);
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
  }, [append, recorder, expectedSpeakers]);

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

  const activeTemplate = templates.find((item) => item.id === templateId);

  return (
    <>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Brand styles={styles} />
          <Pressable onPress={() => setShowSettings(true)} style={styles.settingsButton}>
            <View style={styles.settingsDot} />
            <View style={styles.settingsDot} />
            <View style={styles.settingsDot} />
          </Pressable>
        </View>

        <View style={styles.recorder}>
          <Text style={styles.timer}>{formatDuration(recorder.elapsedSeconds)}</Text>
          {recorder.isRecording ? (
            <>
              <Text style={styles.recorderMeta}>
                녹음 중 · {CHUNK_SECONDS / 60}분 단위 자동 분할
              </Text>
              <View style={styles.meterTrack}>
                <View
                  style={[
                    styles.meterFill,
                    { width: `${Math.round(meterRatio(recorder.metering) * 100)}%` },
                  ]}
                />
              </View>
            </>
          ) : null}

          <Pressable
            disabled={busy}
            onPress={recorder.isRecording ? onStop : onStart}
            style={({ pressed }) => [
              styles.primaryButton,
              recorder.isRecording && styles.primaryButtonStop,
              (pressed || busy) && styles.dimmed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={theme.accentOn} />
            ) : (
              <Text style={styles.primaryButtonLabel}>
                {recorder.isRecording ? '녹음 중지' : '녹음 시작'}
              </Text>
            )}
          </Pressable>
        </View>

        {recorder.error ? <Text style={styles.error}>{recorder.error}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {recorder.isRecording ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>참석자 수</Text>
            <View style={styles.chipRow}>
              {SPEAKER_CHOICES.map((count) => (
                <Pressable
                  key={count}
                  onPress={() => setExpectedSpeakers(count)}
                  style={[styles.chip, expectedSpeakers === count && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      expectedSpeakers === count && styles.chipLabelActive,
                    ]}
                  >
                    {count === MAX_SPEAKER_CHOICE ? `${count}명 이상` : `${count}명`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
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
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>내 세션</Text>
            <Pressable onPress={() => setShowArchived((previous) => !previous)}>
              <Text style={styles.linkLabel}>{showArchived ? '활성만' : '보관함 포함'}</Text>
            </Pressable>
          </View>

          {sessions.map((item) => (
            <SessionCard
              key={item.id}
              session={item}
              styles={styles}
              theme={theme}
              templateName={activeTemplate?.name ?? '선택한 템플릿'}
              artifact={summaries[item.id]}
              expanded={Boolean(expanded[item.id])}
              organizing={organizingId === item.id}
              busyElsewhere={organizingId !== undefined}
              summaryOpen={Boolean(openSummary[item.id])}
              onToggleExpand={() =>
                setExpanded((previous) => ({ ...previous, [item.id]: !previous[item.id] }))
              }
              onOrganize={() => void onOrganize(item)}
              onToggleSummary={() => void onToggleSummary(item)}
              onRetranscribe={() => void onRetranscribe(item)}
              onShare={() => void onShare(item)}
              onArchive={() => void onArchive(item)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </View>

        {showDetails ? (
          <View style={styles.details}>
            <Text style={styles.detailLine}>
              네이티브 {recorder.nativeIsRecording ? '녹음중' : '정지'} ·{' '}
              {formatDuration(recorder.nativeDurationSeconds)} ·{' '}
              {(recorder.fileSize / 1024).toFixed(0)} KB · 청크 {recorder.chunks.length}개
            </Text>
            <Text style={styles.detailLine}>
              입력 레벨 {recorder.metering === undefined ? '-' : recorder.metering.toFixed(1)} dB
            </Text>
            {session ? (
              <Text style={styles.detailLine}>
                현재 세션 {session.id.slice(0, 8)} ·{' '}
                {STATUS_LABELS[session.status] ?? session.status}
              </Text>
            ) : null}
            {log.map((line, index) => (
              <Text key={`${index}-${line}`} style={styles.detailLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        <FooterBrand styles={styles} />
      </ScrollView>

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        styles={styles}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails((previous) => !previous)}
        onOpenGlossary={() => setShowGlossary(true)}
        onRunAdminCheck={() => void runAdminApiCheck()}
        onSignOut={onSignOut}
      />

      <GlossaryScreen visible={showGlossary} onClose={() => setShowGlossary(false)} />
    </>
  );
}

function Shell() {
  const auth = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={theme.statusBar} />
      {!auth.isReady ? (
        <View style={styles.signIn}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : auth.isSignedIn ? (
        <RecorderScreen onSignOut={auth.signOut} />
      ) : (
        <SignInScreen onSignIn={auth.signIn} error={auth.error} />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

type AppStyles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.bg, paddingTop: STATUS_BAR_INSET },
    page: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 22 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    brand: { gap: 2 },
    brandName: { fontSize: 25, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
    brandTagline: { fontSize: 12, color: theme.textMuted },
    settingsButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    settingsDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: theme.textMuted },

    footerBrand: { alignItems: 'center', gap: 16, paddingTop: 12, paddingBottom: 24 },
    footerLine: { width: 28, height: 1, backgroundColor: theme.border },
    footerLogo: { width: 72, height: 34, opacity: 0.45 },

    recorder: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 26,
      paddingHorizontal: 20,
      alignItems: 'center',
      gap: 14,
    },
    timer: {
      fontSize: 52,
      fontWeight: '300',
      color: theme.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: 1,
    },
    recorderMeta: { fontSize: 13, color: theme.textMuted },
    meterTrack: {
      height: 4,
      width: '70%',
      borderRadius: 2,
      backgroundColor: theme.border,
      overflow: 'hidden',
    },
    meterFill: { height: 4, borderRadius: 2, backgroundColor: theme.accent },

    primaryButton: {
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 28,
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: theme.accent,
    },
    primaryButtonStop: { backgroundColor: theme.danger },
    primaryButtonLabel: { color: theme.accentOn, fontSize: 16, fontWeight: '700' },
    dimmed: { opacity: 0.6 },

    section: { gap: 10 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.4 },
    linkLabel: { fontSize: 12, fontWeight: '600', color: theme.accent },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipLabel: { fontSize: 13, color: theme.textMuted, fontWeight: '600' },
    chipLabelActive: { color: theme.accentOn },

    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 10,
    },
    cardActive: { borderColor: theme.accent },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.text },
    cardMeta: { fontSize: 12, color: theme.textMuted },
    cardPreview: { fontSize: 13, lineHeight: 19, color: theme.textMuted },
    cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    pillAccent: { backgroundColor: theme.accentSoft },
    pillAccentLabel: { fontSize: 11, fontWeight: '700', color: theme.accent },
    pillMuted: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border },
    pillMutedLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
    pillDanger: { backgroundColor: theme.dangerSoft },
    pillDangerLabel: { fontSize: 11, fontWeight: '700', color: theme.danger },

    chipButton: {
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 14,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    chipButtonLabel: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    chipButtonFilled: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipButtonFilledLabel: { fontSize: 13, fontWeight: '700', color: theme.accentOn },
    chipButtonDanger: { backgroundColor: theme.dangerSoft, borderColor: theme.dangerSoft },
    chipButtonDangerLabel: { fontSize: 13, fontWeight: '600', color: theme.danger },

    error: { color: theme.danger, fontSize: 13, lineHeight: 19 },

    details: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 4,
    },
    detailLine: { fontSize: 11, lineHeight: 16, color: theme.textMuted },

    signIn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      gap: 10,
    },
    signInLogo: { width: 190, height: 92, marginBottom: 6 },
    signInName: { fontSize: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.6 },
    signInTagline: { fontSize: 14, color: theme.textMuted, marginBottom: 20 },
    signInButton: { marginTop: 4 },

    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(8, 12, 20, 0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 22,
      paddingBottom: 34,
      gap: 14,
    },
    sheetHandle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: 4,
    },
    sheetTitle: { fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.4 },
    sheetDivider: { height: 1, backgroundColor: theme.border },
    sheetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
    },
    sheetRowLabel: { fontSize: 15, fontWeight: '600', color: theme.text },
    sheetRowValue: { fontSize: 13, fontWeight: '600', color: theme.accent },
    sheetRowDanger: { fontSize: 15, fontWeight: '600', color: theme.danger },
    swatchRow: { flexDirection: 'row', gap: 14 },
    swatchCell: { alignItems: 'center', gap: 6 },
    swatch: {
      width: 56,
      height: 56,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchActive: { borderWidth: 2.5, borderColor: theme.accent },
    swatchDot: { width: 14, height: 14, borderRadius: 7 },
    swatchName: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    swatchNameActive: { color: theme.accent },
  });
}
