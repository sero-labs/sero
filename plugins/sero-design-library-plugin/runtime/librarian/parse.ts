import type {
  LibrarianAnalysis,
  LibrarianPaletteEntry,
  LibrarianUserFacingAnalysis,
  LibrarianVisualProfile,
  LibrarianVocabularyTerm,
} from '../../shared/librarian';
import { LIBRARIAN_PROMPT_VERSION, LIBRARIAN_SCHEMA_VERSION } from '../../shared/librarian';

/**
 * Reading the Librarian's reply.
 *
 * This validates *format* only. It never tries to infer design language from
 * prose — that is the model's job, and a hand-written parser guessing at it
 * would quietly produce worse analysis than the model already returned.
 *
 * Violations are reported rather than silently corrected, so the structured-run
 * repair loop can ask for a fix in the same session. Clamping happens only at
 * the end, when repair attempts are exhausted and a slightly-too-long list is
 * better than no analysis at all.
 */

export const CONTENT_LIMITS = {
  designTypes: 3,
  tagsMin: 6,
  tagsMax: 12,
  vocabulary: 8,
  visualGroup: 4,
  guardrails: 5,
  promptWordsMin: 80,
  promptWordsMax: 150,
} as const;

const VISUAL_GROUPS: readonly (keyof LibrarianVisualProfile)[] = [
  'colour',
  'typography',
  'layout',
  'spacingAndDensity',
  'shapeLanguage',
  'surfaces',
  'imagery',
  'motion',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pull the JSON body out of a reply that may be fenced or prefaced with prose. */
export function extractJson(reply: string): unknown | null {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], reply].filter((value) => typeof value === 'string');
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    } catch {
      continue;
    }
  }
  return null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function vocabulary(value: unknown): LibrarianVocabularyTerm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LibrarianVocabularyTerm[] => {
    if (typeof entry === 'string') return entry.trim() === '' ? [] : [{ term: entry.trim() }];
    if (!isRecord(entry) || typeof entry.term !== 'string') return [];
    const meaning = typeof entry.meaning === 'string' ? entry.meaning.trim() : '';
    return [{ term: entry.term.trim(), ...(meaning === '' ? {} : { meaning }) }];
  });
}

function palette(value: unknown): LibrarianPaletteEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LibrarianPaletteEntry[] => {
    if (!isRecord(entry) || typeof entry.hex !== 'string') return [];
    const hex = entry.hex.trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) return [];
    return [{ hex: hex.toLowerCase(), role: typeof entry.role === 'string' ? entry.role.trim() : '' }];
  });
}

function visualProfile(value: unknown): LibrarianVisualProfile {
  const source = isRecord(value) ? value : {};
  const result = {} as LibrarianVisualProfile;
  for (const group of VISUAL_GROUPS) result[group] = strings(source[group]);
  return result;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word !== '').length;
}

export interface ParsedAnalysis {
  analysis: LibrarianUserFacingAnalysis;
  confidence: number;
}

/** Shape the reply into the domain type. Returns null when it is not JSON at all. */
export function parseAnalysis(reply: string): ParsedAnalysis | null {
  const parsed = extractJson(reply);
  if (!isRecord(parsed)) return null;

  return {
    analysis: {
      title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
      // Generated notes are always empty: notes belong to the user, and giving
      // them a generated baseline would make "reset" restore text the user
      // never wrote (spec §5.4).
      notes: '',
      designTypes: strings(parsed.designTypes),
      primaryStyle: typeof parsed.primaryStyle === 'string' ? parsed.primaryStyle.trim() : '',
      tags: strings(parsed.tags),
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      designIntent: typeof parsed.designIntent === 'string' ? parsed.designIntent.trim() : '',
      aestheticVocabulary: vocabulary(parsed.aestheticVocabulary),
      visualProfile: visualProfile(parsed.visualProfile),
      palette: palette(parsed.palette),
      always: strings(parsed.always),
      never: strings(parsed.never),
      generationPrompt:
        typeof parsed.generationPrompt === 'string' ? parsed.generationPrompt.trim() : '',
    },
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
  };
}

/** Human-readable problems, used as the repair follow-up message. */
export function validateAnalysis(analysis: LibrarianUserFacingAnalysis): string[] {
  const problems: string[] = [];
  if (analysis.title === '') problems.push('`title` is missing.');
  if (analysis.primaryStyle === '') problems.push('`primaryStyle` is missing.');
  if (analysis.summary === '') problems.push('`summary` is missing.');
  if (analysis.designIntent === '') problems.push('`designIntent` is missing.');
  if (analysis.designTypes.length === 0 || analysis.designTypes.length > CONTENT_LIMITS.designTypes) {
    problems.push(`\`designTypes\` must hold 1–${CONTENT_LIMITS.designTypes} entries.`);
  }
  if (analysis.tags.length < CONTENT_LIMITS.tagsMin || analysis.tags.length > CONTENT_LIMITS.tagsMax) {
    problems.push(`\`tags\` must hold ${CONTENT_LIMITS.tagsMin}–${CONTENT_LIMITS.tagsMax} entries.`);
  }
  if (analysis.aestheticVocabulary.length > CONTENT_LIMITS.vocabulary) {
    problems.push(`\`aestheticVocabulary\` must hold at most ${CONTENT_LIMITS.vocabulary} entries.`);
  }
  for (const group of VISUAL_GROUPS) {
    if (analysis.visualProfile[group].length > CONTENT_LIMITS.visualGroup) {
      problems.push(`\`visualProfile.${group}\` must hold at most ${CONTENT_LIMITS.visualGroup} observations.`);
    }
  }
  if (analysis.always.length > CONTENT_LIMITS.guardrails) {
    problems.push(`\`always\` must hold at most ${CONTENT_LIMITS.guardrails} entries.`);
  }
  if (analysis.never.length > CONTENT_LIMITS.guardrails) {
    problems.push(`\`never\` must hold at most ${CONTENT_LIMITS.guardrails} entries.`);
  }
  const words = wordCount(analysis.generationPrompt);
  if (words < CONTENT_LIMITS.promptWordsMin || words > CONTENT_LIMITS.promptWordsMax) {
    problems.push(
      `\`generationPrompt\` must be ${CONTENT_LIMITS.promptWordsMin}–${CONTENT_LIMITS.promptWordsMax} words (it is ${words}).`,
    );
  }
  return problems;
}

/** Last-resort trimming so an over-long but usable reply still becomes analysis. */
export function clampAnalysis(analysis: LibrarianUserFacingAnalysis): LibrarianUserFacingAnalysis {
  const profile = {} as LibrarianVisualProfile;
  for (const group of VISUAL_GROUPS) {
    profile[group] = analysis.visualProfile[group].slice(0, CONTENT_LIMITS.visualGroup);
  }
  return {
    ...analysis,
    designTypes: analysis.designTypes.slice(0, CONTENT_LIMITS.designTypes),
    tags: analysis.tags.slice(0, CONTENT_LIMITS.tagsMax),
    aestheticVocabulary: analysis.aestheticVocabulary.slice(0, CONTENT_LIMITS.vocabulary),
    visualProfile: profile,
    always: analysis.always.slice(0, CONTENT_LIMITS.guardrails),
    never: analysis.never.slice(0, CONTENT_LIMITS.guardrails),
  };
}

export function toLibrarianAnalysis(
  parsed: ParsedAnalysis,
  provenance: LibrarianAnalysis['provenance'],
): LibrarianAnalysis {
  return {
    ...clampAnalysis(parsed.analysis),
    schemaVersion: LIBRARIAN_SCHEMA_VERSION,
    confidence: parsed.confidence,
    provenance: { ...provenance, promptVersion: LIBRARIAN_PROMPT_VERSION },
  };
}
