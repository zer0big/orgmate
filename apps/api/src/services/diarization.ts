import type { TranscribedPhrase } from './speech.js';

/** Ignore speakers that barely talk; they are usually diarization noise. */
const MIN_SHARE = 0.04;
const MIN_DURATION_MS = 4000;

export interface SpeakerSegment {
  speaker?: number;
  durationMilliseconds: number;
}

/**
 * Diarization frequently invents extra speakers from crosstalk or background
 * noise. Phrases from speakers who barely talk are folded into the adjacent
 * speaker, then the survivors are renumbered 1..N in order of first appearance.
 *
 * When the user told us how many people were in the room, only the loudest
 * `expectedSpeakers` survive; everything else is absorbed by a neighbour.
 */
export function normalizeSpeakers<T extends SpeakerSegment>(
  segments: T[],
  expectedSpeakers?: number,
): { segments: T[]; speakerCount: number } {
  const spoken = new Map<number, number>();
  let total = 0;

  for (const segment of segments) {
    if (segment.speaker === undefined) {
      continue;
    }
    spoken.set(segment.speaker, (spoken.get(segment.speaker) ?? 0) + segment.durationMilliseconds);
    total += segment.durationMilliseconds;
  }

  if (spoken.size === 0 || total === 0) {
    return { segments, speakerCount: spoken.size };
  }

  const ranked = [...spoken.entries()].sort((a, b) => b[1] - a[1]);
  const keep = new Set<number>();

  for (const [speaker, duration] of ranked) {
    if (expectedSpeakers && keep.size >= expectedSpeakers) {
      break;
    }
    const isNoise = duration / total < MIN_SHARE && duration < MIN_DURATION_MS;
    if (!isNoise || keep.size === 0) {
      keep.add(speaker);
    }
  }

  // Reassign dropped speakers to whoever spoke immediately before them.
  let previousKept: number | undefined;
  const reassigned = segments.map((segment) => {
    if (segment.speaker === undefined) {
      return segment;
    }
    if (keep.has(segment.speaker)) {
      previousKept = segment.speaker;
      return segment;
    }
    const fallback = previousKept ?? ranked.find(([speaker]) => keep.has(speaker))?.[0];
    return fallback === undefined ? segment : { ...segment, speaker: fallback };
  });

  // Renumber so the first person to speak is always 화자 1.
  const renumbered = new Map<number, number>();
  for (const segment of reassigned) {
    if (segment.speaker !== undefined && !renumbered.has(segment.speaker)) {
      renumbered.set(segment.speaker, renumbered.size + 1);
    }
  }

  return {
    segments: reassigned.map((segment) =>
      segment.speaker === undefined
        ? segment
        : { ...segment, speaker: renumbered.get(segment.speaker) },
    ),
    speakerCount: renumbered.size,
  };
}

/** Counts the distinct speakers the service reported for a single chunk. */
export function distinctSpeakers(phrases: TranscribedPhrase[]): number {
  return new Set(phrases.map((phrase) => phrase.speaker).filter((id) => id !== undefined)).size;
}
