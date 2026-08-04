import type {
  LibrarianField,
  LibrarianPaletteEntry,
  LibrarianUserFacingAnalysis,
  LibrarianVisualProfile,
  LibrarianVocabularyTerm,
} from '../../shared/librarian';

/**
 * Editing every analysis field as text.
 *
 * The override contract is per whole field, so each field needs exactly one
 * editor. Rather than build a bespoke control for vocabulary, palettes and the
 * eight-group visual profile, each structured field round-trips through a
 * line-based text form that reads the way it displays. One editor, and no
 * field is left read-only.
 */

export type FieldShape = 'line' | 'paragraph' | 'list' | 'vocabulary' | 'palette' | 'profile';

export const FIELD_SHAPES: Record<LibrarianField, FieldShape> = {
  title: 'line',
  notes: 'paragraph',
  designTypes: 'list',
  primaryStyle: 'line',
  tags: 'list',
  summary: 'paragraph',
  designIntent: 'paragraph',
  aestheticVocabulary: 'vocabulary',
  visualProfile: 'profile',
  palette: 'palette',
  always: 'list',
  never: 'list',
  generationPrompt: 'paragraph',
};

export const FIELD_LABELS: Record<LibrarianField, string> = {
  title: 'Title',
  notes: 'Notes',
  designTypes: 'Design types',
  primaryStyle: 'Primary style',
  tags: 'Tags',
  summary: 'Summary',
  designIntent: 'Design intent',
  aestheticVocabulary: 'Vocabulary',
  visualProfile: 'Visual construction',
  palette: 'Palette',
  always: 'Always',
  never: 'Never',
  generationPrompt: 'Generation prompt',
};

/** Shown under the editor so the text form is never a guessing game. */
export const FIELD_HINTS: Partial<Record<LibrarianField, string>> = {
  designTypes: 'One per line',
  tags: 'One per line',
  always: 'One per line',
  never: 'One per line',
  aestheticVocabulary: 'One per line: term — meaning',
  palette: 'One per line: #hex — role',
  visualProfile: 'One group per line: group: observation, observation',
};

const PROFILE_GROUPS: readonly (keyof LibrarianVisualProfile)[] = [
  'colour',
  'typography',
  'layout',
  'spacingAndDensity',
  'shapeLanguage',
  'surfaces',
  'imagery',
  'motion',
];

export const PROFILE_GROUP_LABELS: Record<keyof LibrarianVisualProfile, string> = {
  colour: 'Colour',
  typography: 'Typography',
  layout: 'Layout',
  spacingAndDensity: 'Density',
  shapeLanguage: 'Shape',
  surfaces: 'Surfaces',
  imagery: 'Imagery',
  motion: 'Motion',
};

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** Accepts an em dash, an en dash or a hyphen as the separator. */
function splitPair(line: string): [string, string] {
  const match = line.match(/^(.*?)\s+[—–-]\s+(.*)$/);
  if (!match) return [line.trim(), ''];
  return [match[1].trim(), match[2].trim()];
}

export function encodeField(
  field: LibrarianField,
  value: LibrarianUserFacingAnalysis[LibrarianField],
): string {
  switch (FIELD_SHAPES[field]) {
    case 'line':
    case 'paragraph':
      return typeof value === 'string' ? value : '';

    case 'list':
      return Array.isArray(value) ? (value as string[]).join('\n') : '';

    case 'vocabulary':
      return ((value ?? []) as LibrarianVocabularyTerm[])
        .map((entry) => (entry.meaning ? `${entry.term} — ${entry.meaning}` : entry.term))
        .join('\n');

    case 'palette':
      return ((value ?? []) as LibrarianPaletteEntry[])
        .map((entry) => (entry.role ? `${entry.hex} — ${entry.role}` : entry.hex))
        .join('\n');

    case 'profile': {
      const profile = (value ?? {}) as LibrarianVisualProfile;
      return PROFILE_GROUPS.filter((group) => (profile[group] ?? []).length > 0)
        .map((group) => `${PROFILE_GROUP_LABELS[group]}: ${profile[group].join(', ')}`)
        .join('\n');
    }
  }
}

export function decodeField(
  field: LibrarianField,
  text: string,
): LibrarianUserFacingAnalysis[LibrarianField] {
  switch (FIELD_SHAPES[field]) {
    case 'line':
    case 'paragraph':
      return text.trim();

    case 'list':
      return lines(text);

    case 'vocabulary':
      return lines(text).map((line) => {
        const [term, meaning] = splitPair(line);
        return meaning === '' ? { term } : { term, meaning };
      });

    case 'palette':
      return lines(text).flatMap((line) => {
        const [hex, role] = splitPair(line);
        return /^#[0-9a-fA-F]{3,8}$/.test(hex) ? [{ hex: hex.toLowerCase(), role }] : [];
      });

    case 'profile': {
      const byLabel = new Map(
        PROFILE_GROUPS.map((group) => [PROFILE_GROUP_LABELS[group].toLowerCase(), group]),
      );
      const profile: LibrarianVisualProfile = {
        colour: [],
        typography: [],
        layout: [],
        spacingAndDensity: [],
        shapeLanguage: [],
        surfaces: [],
        imagery: [],
        motion: [],
      };

      for (const line of lines(text)) {
        const separator = line.indexOf(':');
        if (separator === -1) continue;
        const group = byLabel.get(line.slice(0, separator).trim().toLowerCase());
        if (!group) continue;
        profile[group] = line
          .slice(separator + 1)
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '');
      }
      return profile;
    }
  }
}

export { PROFILE_GROUPS };
