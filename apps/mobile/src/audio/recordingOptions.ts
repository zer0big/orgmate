import type { RecordingOptions } from 'expo-audio';

/**
 * Speech-optimized recording profile.
 *
 * Mono is mandatory: Azure Speech fast transcription only performs speaker
 * diarization on single-channel audio. 16 kHz / 64 kbps AAC keeps one hour of
 * audio around 28 MB, well under the 500 MB service limit.
 */
export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  // The cache directory can be reclaimed by the OS mid-session.
  directory: 'document',
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'voice_recognition',
  },
  ios: {
    outputFormat: 'aac ',
    // AudioQuality.HIGH
    audioQuality: 0x60,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
};

/** Each chunk is uploaded independently so a crash loses at most this much audio. */
export const CHUNK_SECONDS = 5 * 60;
