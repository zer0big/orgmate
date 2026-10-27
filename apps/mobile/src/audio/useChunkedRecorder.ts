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
export function useChunkedRecorder(): ChunkedRecorder {
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 500);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunks, setChunks] = useState<RecordedChunk[]>([]);
  const [error, setError] = useState<string | undefined>();

  const sessionIdRef = useRef<string>('');
  const chunkIndexRef = useRef(0);
  const rotatingRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const chunksRef = useRef<RecordedChunk[]>([]);

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
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = undefined;
    }
  }, []);

  const rotate = useCallback(async () => {
    if (rotatingRef.current) {
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
      recorder.record();
    } catch (cause) {
      setError(`청크 전환 실패: ${String(cause)}`);
    } finally {
      rotatingRef.current = false;
    }
  }, [pushChunk, recorder]);

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
      recorder.record();
      setIsRecording(true);

      clearTick();
      tickRef.current = setInterval(() => {
        setElapsedSeconds((previous) => {
          const next = previous + 1;
          if (next > 0 && next % CHUNK_SECONDS === 0) {
            void rotate();
          }
          return next;
        });
      }, 1000);
    },
    [clearTick, recorder, rotate],
  );

  const stop = useCallback(async () => {
    clearTick();
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
    metering: recorderState.metering,
    chunks,
    error,
    start,
    stop,
    reset,
  };
}
