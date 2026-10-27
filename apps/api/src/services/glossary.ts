import { templatesContainer } from './cosmos.js';

/** Cosmos limits us to one glossary document per user, keyed by this id. */
const GLOSSARY_ID = 'glossary';

/** Fast transcription caps the phrase list, so keep the glossary bounded. */
export const MAX_TERMS = 200;
export const MAX_ALIASES_PER_TERM = 10;

export interface GlossaryTerm {
  /** The correct spelling that should appear in transcripts. */
  text: string;
  /** Known mis-recognitions that get rewritten to `text` after transcription. */
  aliases: string[];
  /** Optional note shown in the admin UI only. */
  note?: string;
}

export interface GlossaryDocument {
  id: string;
  userId: string;
  type: 'glossary';
  terms: GlossaryTerm[];
  updatedAt: string;
}

export async function readGlossary(userId: string): Promise<GlossaryTerm[]> {
  try {
    const { resource } = await templatesContainer
      .item(GLOSSARY_ID, userId)
      .read<GlossaryDocument>();
    return resource?.terms ?? [];
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return [];
    }
    throw error;
  }
}

export async function saveGlossary(userId: string, terms: GlossaryTerm[]): Promise<GlossaryTerm[]> {
  const document: GlossaryDocument = {
    id: GLOSSARY_ID,
    userId,
    type: 'glossary',
    terms,
    updatedAt: new Date().toISOString(),
  };
  await templatesContainer.items.upsert(document);
  return terms;
}

/** Normalises arbitrary client input into a storable glossary. */
export function sanitizeTerms(input: unknown): GlossaryTerm[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const terms: GlossaryTerm[] = [];

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const candidate = raw as { text?: unknown; aliases?: unknown; note?: unknown };
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);

    const aliases = Array.isArray(candidate.aliases)
      ? [
          ...new Set(
            candidate.aliases
              .map((alias) => (typeof alias === 'string' ? alias.trim() : ''))
              .filter((alias) => alias.length > 0 && alias !== text),
          ),
        ].slice(0, MAX_ALIASES_PER_TERM)
      : [];

    const note = typeof candidate.note === 'string' ? candidate.note.trim() : undefined;
    terms.push({ text, aliases, note: note || undefined });

    if (terms.length >= MAX_TERMS) {
      break;
    }
  }

  return terms;
}

/** Phrases sent to Speech as a recognition bias, longest first so they win ties. */
export function toPhraseList(terms: GlossaryTerm[]): string[] {
  return [...new Set(terms.map((term) => term.text))].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites known mis-recognitions to the canonical spelling. Longer aliases are
 * replaced first so that a short alias never eats part of a longer match.
 */
export function applyGlossary(text: string, terms: GlossaryTerm[]): string {
  if (!text || terms.length === 0) {
    return text;
  }

  const replacements = terms
    .flatMap((term) => term.aliases.map((alias) => ({ alias, text: term.text })))
    .sort((a, b) => b.alias.length - a.alias.length);

  let result = text;
  for (const replacement of replacements) {
    result = result.replace(new RegExp(escapeRegExp(replacement.alias), 'gi'), replacement.text);
  }
  return result;
}
