import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { CHUNK_SECONDS, SPEECH_RECORDING_OPTIONS } from './recordingOptions';

export interface RecordedChunk {
  index: number;
  uri: string;
  recordedAt: string;
}

export interface ChunkedRecorder {
  isRecording: boolean;
  elapsedSeconds: number;
  nativeDurationSeconds: number;
  nativeIsRecording: boolean;
  fileSize: number;
  metering: number | undefined;
  chunks: RecordedChunk[];
  error: string | undefined;
  start: (sessionId: string) => Promise<void>;
  stop: () => Promise<RecordedChunk[]>;
  reset: () => void;
}

function chunkFileName(sessionId: string, index: number): string {
  return `${sessionId}-${String(index).padStart(4, '0')}`;
}

/**
 * Records continuously while rotating to a new file every CHUNK_SECONDS.
 * Relies on expo-audio's Android foreground service, enabled through the
 * `enableBackgroundRecording` config plugin option, to survive screen-off and
 * app-switch.
 */
export function useChunkedRecorder(onChunk?: (chunk: RecordedChunk) => void): ChunkedRecorder {
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 500);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunks, setChunks] = useState<RecordedChunk[]>([]);
  const [error, setError] = useState<string | undefined>();

  const sessionIdRef = useRef<string>('');
  const chunkIndexRef = useRef(0);
  const rotatingRef = useRef(false);
  const recordingRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startedAtRef = useRef(0);
  const chunkStartedAtRef = useRef(0);
  const chunksRef = useRef<RecordedChunk[]>([]);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const pushChunk = useCallback((uri: string | null) => {
    if (!uri) {
      return;
    }
    const chunk: RecordedChunk = {
      index: chunkIndexRef.current,
      uri,
      recordedAt: new Date().toISOString(),
    };
    chunksRef.current = [...chunksRef.current, chunk];
    setChunks(chunksRef.current);
    onChunkRef.current?.(chunk);
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = undefined;
    }
  }, []);

  /**
   * Binding to the Android recording foreground service is asynchronous, so the
   * first `record()` right after `prepareToRecordAsync()` can be rejected with
   * "the service connection is not bound". Retry briefly before giving up.
   */
  const startNative = useCallback(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        recorder.record();
        return;
      } catch (cause) {
        if (attempt >= 10) {
          throw cause;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }, [recorder]);

  const rotate = useCallback(async () => {
    if (rotatingRef.current || !recordingRef.current) {
      return;
    }
    rotatingRef.current = true;
    try {
      await recorder.stop();
      pushChunk(recorder.uri);
      chunkIndexRef.current += 1;
      await recorder.prepareToRecordAsync({
        ...SPEECH_RECORDING_OPTIONS,
        fileName: chunkFileName(sessionIdRef.current, chunkIndexRef.current),
      });
      await startNative();
      chunkStartedAtRef.current = Date.now();
    } catch (cause) {
      chunkStartedAtRef.current = Date.now();
      setError(`청크 전환 실패: ${String(cause)}`);
    } finally {
      rotatingRef.current = false;
    }
  }, [pushChunk, recorder, startNative]);

  const start = useCallback(
    async (sessionId: string) => {
      setError(undefined);

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('마이크 권한이 거부되었습니다.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        allowsBackgroundRecording: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      });

      sessionIdRef.current = sessionId;
      chunkIndexRef.current = 0;
      chunksRef.current = [];
      setChunks([]);
      setElapsedSeconds(0);

      await recorder.prepareToRecordAsync({
        ...SPEECH_RECORDING_OPTIONS,
        fileName: chunkFileName(sessionId, 0),
      });
      await startNative();
      startedAtRef.current = Date.now();
      chunkStartedAtRef.current = startedAtRef.current;
      recordingRef.current = true;
      setIsRecording(true);

      clearTick();
      // Wall-clock based so a throttled or suspended JS thread does not lose time.
      tickRef.current = setInterval(() => {
        if (!recordingRef.current) {
          return;
        }
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
        if (Date.now() - chunkStartedAtRef.current >= CHUNK_SECONDS * 1000) {
          void rotate();
        }
      }, 1000);
    },
    [clearTick, recorder, rotate, startNative],
  );

  const stop = useCallback(async () => {
    clearTick();
    recordingRef.current = false;
    try {
      await recorder.stop();
      pushChunk(recorder.uri);
    } catch (cause) {
      setError(`녹음 종료 실패: ${String(cause)}`);
    }
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false });
    setIsRecording(false);
    return chunksRef.current;
  }, [clearTick, pushChunk, recorder]);

  const reset = useCallback(() => {
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    setChunks([]);
    setElapsedSeconds(0);
    setError(undefined);
  }, []);

  useEffect(() => clearTick, [clearTick]);

  return {
    isRecording,
    elapsedSeconds,
    nativeDurationSeconds: Math.floor(recorderState.durationMillis / 1000),
    nativeIsRecording: recorderState.isRecording,
    fileSize: recorderState.fileSize,
    metering: recorderState.metering,
    chunks,
    error,
    start,
    stop,
    reset,
  };
}
