import { useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useChunkedRecorder } from './src/audio/useChunkedRecorder';
import { CHUNK_SECONDS } from './src/audio/recordingOptions';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function App() {
  const recorder = useChunkedRecorder();

  const sessionId = useMemo(
    () => `spike-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    [],
  );

  const onToggle = async () => {
    if (recorder.isRecording) {
      await recorder.stop();
    } else {
      await recorder.start(sessionId);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>OrgMate 녹음 스파이크</Text>
        <Text style={styles.subtitle}>
          백그라운드 녹음 검증용 화면이다. 녹음을 시작한 뒤 화면을 끄거나 다른 앱으로 전환해도
          경과 시간과 청크가 계속 늘어나야 한다.
        </Text>

        <View style={styles.card}>
          <Text style={styles.timer}>{formatDuration(recorder.elapsedSeconds)}</Text>
          <Text style={styles.meta}>
            상태 {recorder.isRecording ? '녹음 중' : '정지'} · 청크 {recorder.chunks.length}개 ·
            분할 주기 {CHUNK_SECONDS / 60}분
          </Text>
          <Text style={styles.meta}>
            입력 레벨 {recorder.metering === undefined ? '-' : recorder.metering.toFixed(1)} dB
          </Text>
        </View>

        <Pressable
          onPress={onToggle}
          style={({ pressed }) => [
            styles.button,
            recorder.isRecording ? styles.buttonStop : styles.buttonStart,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {recorder.isRecording ? '녹음 중지' : '녹음 시작'}
          </Text>
        </Pressable>

        {recorder.error ? <Text style={styles.error}>{recorder.error}</Text> : null}

        <Text style={styles.sectionTitle}>생성된 청크</Text>
        {recorder.chunks.length === 0 ? (
          <Text style={styles.meta}>아직 없음</Text>
        ) : (
          recorder.chunks.map((chunk) => (
            <View key={chunk.index} style={styles.chunkRow}>
              <Text style={styles.chunkIndex}>#{chunk.index}</Text>
              <Text style={styles.chunkUri} numberOfLines={2}>
                {chunk.uri}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  container: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#101828' },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#475467' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  timer: { fontSize: 40, fontWeight: '700', color: '#101828', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: '#475467' },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonStart: { backgroundColor: '#1570EF' },
  buttonStop: { backgroundColor: '#D92D20' },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  error: { color: '#B42318', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#101828', marginTop: 8 },
  chunkRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  chunkIndex: { fontWeight: '700', color: '#101828' },
  chunkUri: { flex: 1, fontSize: 11, color: '#475467' },
});
