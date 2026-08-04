/**
 * The Librarian contract — generated design-language analysis for one item,
 * and the override model that makes every user-facing field independently
 * editable and independently resettable (spec §5.3, §5.4).
 *
 * The key rule: generated analysis and user overrides are stored separately,
 * and *presence* of an override — not truthiness — marks a field manual. That
 * is what lets a user deliberately blank a field, and what lets reanalysis
 * refresh untouched fields without disturbing manual work.
 */

export interface LibrarianVisualProfile {
  colour: string[];
  typography: string[];
  layout: string[];
  spacingAndDensity: string[];
  shapeLanguage: string[];
  surfaces: string[];
  imagery: string[];
  motion: string[];
}

export interface LibrarianVocabularyTerm {
  term: string;
  meaning?: string;
}

export interface LibrarianPaletteEntry {
  hex: string;
  role: string;
}

export interface LibrarianUserFacingAnalysis {
  title: string;
  notes: string;
  designTypes: string[];
  primaryStyle: string;
  tags: string[];
  summary: string;
  designIntent: string;
  aestheticVocabulary: LibrarianVocabularyTerm[];
  visualProfile: LibrarianVisualProfile;
  palette?: LibrarianPaletteEntry[];
  always: string[];
  never: string[];
  generationPrompt: string;
}

export interface LibrarianProvenance {
  providerId?: string;
  modelId?: string;
  analysedAt: number;
  durationMs?: number;
  tokenUsage?: unknown;
  cost?: number;
  promptVersion: number;
}

export interface LibrarianAnalysis extends LibrarianUserFacingAnalysis {
  schemaVersion: number;
  confidence: number;
  provenance: LibrarianProvenance;
}

export type LibrarianField = keyof LibrarianUserFacingAnalysis;

export interface FieldOverride<TField extends LibrarianField = LibrarianField> {
  field: TField;
  value: LibrarianUserFacingAnalysis[TField];
  updatedAt: number;
}

export type LibrarianOverrides = {
  [TField in LibrarianField]?: FieldOverride<TField>;
};

/** Any single override, with its field and value still correlated. */
export type AnyFieldOverride = {
  [TField in LibrarianField]: FieldOverride<TField>;
}[LibrarianField];

export interface EditableLibrarianProfile {
  generated: LibrarianAnalysis;
  overrides: LibrarianOverrides;
}

export const LIBRARIAN_SCHEMA_VERSION = 1;
export const LIBRARIAN_PROMPT_VERSION = 1;

export const LIBRARIAN_FIELDS: readonly LibrarianField[] = [
  'title',
  'notes',
  'designTypes',
  'primaryStyle',
  'tags',
  'summary',
  'designIntent',
  'aestheticVocabulary',
  'visualProfile',
  'palette',
  'always',
  'never',
  'generationPrompt',
] as const;

export function isLibrarianField(value: unknown): value is LibrarianField {
  return typeof value === 'string' && (LIBRARIAN_FIELDS as readonly string[]).includes(value);
}

export const EMPTY_VISUAL_PROFILE: LibrarianVisualProfile = {
  colour: [],
  typography: [],
  layout: [],
  spacingAndDensity: [],
  shapeLanguage: [],
  surfaces: [],
  imagery: [],
  motion: [],
};

/**
 * The baseline every editable field falls back to. Generated notes default to
 * an empty string on purpose, so user notes use the same override mechanism as
 * every other field rather than a special case.
 */
export function emptyAnalysis(title: string): LibrarianAnalysis {
  return {
    title,
    notes: '',
    designTypes: [],
    primaryStyle: '',
    tags: [],
    summary: '',
    designIntent: '',
    aestheticVocabulary: [],
    visualProfile: { ...EMPTY_VISUAL_PROFILE },
    palette: [],
    always: [],
    never: [],
    generationPrompt: '',
    schemaVersion: LIBRARIAN_SCHEMA_VERSION,
    confidence: 0,
    provenance: { analysedAt: 0, promptVersion: LIBRARIAN_PROMPT_VERSION },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Fill a stored analysis out to the full shape.
 *
 * Everything downstream — the projection, the search text, the inspector —
 * dereferences these fields without checking. Coercing once, here, is what
 * lets a record written by an older version of the plugin still render
 * instead of throwing halfway through building the index.
 */
export function normalizeAnalysis(value: unknown): LibrarianAnalysis {
  const base = emptyAnalysis('');
  if (!isObject(value)) return base;

  const profile = isObject(value.visualProfile) ? value.visualProfile : {};
  const visualProfile = { ...EMPTY_VISUAL_PROFILE };
  for (const group of Object.keys(EMPTY_VISUAL_PROFILE) as (keyof LibrarianVisualProfile)[]) {
    visualProfile[group] = stringsOf(profile[group]);
  }

  const provenance = isObject(value.provenance) ? value.provenance : {};

  return {
    title: typeof value.title === 'string' ? value.title : base.title,
    notes: typeof value.notes === 'string' ? value.notes : '',
    designTypes: stringsOf(value.designTypes),
    primaryStyle: typeof value.primaryStyle === 'string' ? value.primaryStyle : '',
    tags: stringsOf(value.tags),
    summary: typeof value.summary === 'string' ? value.summary : '',
    designIntent: typeof value.designIntent === 'string' ? value.designIntent : '',
    aestheticVocabulary: Array.isArray(value.aestheticVocabulary)
      ? value.aestheticVocabulary.flatMap((entry) =>
          isObject(entry) && typeof entry.term === 'string'
            ? [{ term: entry.term, ...(typeof entry.meaning === 'string' ? { meaning: entry.meaning } : {}) }]
            : [],
        )
      : [],
    visualProfile,
    palette: Array.isArray(value.palette)
      ? value.palette.flatMap((entry) =>
          isObject(entry) && typeof entry.hex === 'string'
            ? [{ hex: entry.hex, role: typeof entry.role === 'string' ? entry.role : '' }]
            : [],
        )
      : [],
    always: stringsOf(value.always),
    never: stringsOf(value.never),
    generationPrompt: typeof value.generationPrompt === 'string' ? value.generationPrompt : '',
    schemaVersion:
      typeof value.schemaVersion === 'number' ? value.schemaVersion : LIBRARIAN_SCHEMA_VERSION,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    provenance: {
      ...(typeof provenance.providerId === 'string' ? { providerId: provenance.providerId } : {}),
      ...(typeof provenance.modelId === 'string' ? { modelId: provenance.modelId } : {}),
      analysedAt: typeof provenance.analysedAt === 'number' ? provenance.analysedAt : 0,
      ...(typeof provenance.durationMs === 'number' ? { durationMs: provenance.durationMs } : {}),
      ...(provenance.tokenUsage === undefined ? {} : { tokenUsage: provenance.tokenUsage }),
      ...(typeof provenance.cost === 'number' ? { cost: provenance.cost } : {}),
      promptVersion:
        typeof provenance.promptVersion === 'number' ? provenance.promptVersion : LIBRARIAN_PROMPT_VERSION,
    },
  };
}

/**
 * Validate a value offered for one analysis field.
 *
 * Overrides arrive from tool callers, including the main agent, and the
 * projection reads every field without checking — so a `tags` set to a number
 * becomes a crash the moment the grid rebuilds. Rejecting is deliberate rather
 * than coercing: silently turning a bad value into an empty list would tell
 * the caller it worked while throwing their data away.
 */
export function validateFieldValue(
  field: LibrarianField,
  value: unknown,
): { ok: true; value: LibrarianUserFacingAnalysis[LibrarianField] } | { ok: false; reason: string } {
  const bad = (expected: string) => ({ ok: false as const, reason: `\`${field}\` expects ${expected}.` });
  const good = (checked: unknown) => ({
    ok: true as const,
    value: checked as LibrarianUserFacingAnalysis[LibrarianField],
  });

  const isStringArray = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.every((entry) => typeof entry === 'string');

  switch (field) {
    case 'title':
    case 'notes':
    case 'primaryStyle':
    case 'summary':
    case 'designIntent':
    case 'generationPrompt':
      return typeof value === 'string' ? good(value) : bad('a string');

    case 'designTypes':
    case 'tags':
    case 'always':
    case 'never':
      return isStringArray(value) ? good(value) : bad('an array of strings');

    case 'aestheticVocabulary':
      return Array.isArray(value) &&
        value.every(
          (entry) =>
            isObject(entry) &&
            typeof entry.term === 'string' &&
            (entry.meaning === undefined || typeof entry.meaning === 'string'),
        )
        ? good(value)
        : bad('an array of { term, meaning? } objects');

    case 'palette':
      return Array.isArray(value) &&
        value.every(
          (entry) =>
            isObject(entry) &&
            typeof entry.hex === 'string' &&
            /^#[0-9a-fA-F]{3,8}$/.test(entry.hex) &&
            (entry.role === undefined || typeof entry.role === 'string'),
        )
        ? good(value)
        : bad('an array of { hex, role } objects with #rrggbb colours');

    case 'visualProfile':
      return isObject(value) &&
        (Object.keys(EMPTY_VISUAL_PROFILE) as (keyof LibrarianVisualProfile)[]).every((group) =>
          value[group] === undefined ? true : isStringArray(value[group]),
        )
        ? good({ ...EMPTY_VISUAL_PROFILE, ...(value as Partial<LibrarianVisualProfile>) })
        : bad('an object of observation groups, each an array of strings');
  }
}

/** Drop any stored override this version cannot trust. Used when reading records. */
export function normalizeOverrides(value: unknown): LibrarianOverrides {
  if (!isObject(value)) return {};
  const overrides: Record<string, unknown> = {};

  for (const field of LIBRARIAN_FIELDS) {
    const entry = value[field];
    if (!isObject(entry)) continue;
    const checked = validateFieldValue(field, entry.value);
    if (!checked.ok) continue;
    overrides[field] = {
      field,
      value: checked.value,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    };
  }
  return overrides as LibrarianOverrides;
}

/** True when the field carries a user override, regardless of its value. */
export function isOverridden(profile: EditableLibrarianProfile, field: LibrarianField): boolean {
  return Object.prototype.hasOwnProperty.call(profile.overrides, field) &&
    profile.overrides[field] !== undefined;
}

/** The value the user sees: the override when present, otherwise the generated value. */
export function effectiveField<TField extends LibrarianField>(
  profile: EditableLibrarianProfile,
  field: TField,
): LibrarianUserFacingAnalysis[TField] {
  const override = profile.overrides[field] as FieldOverride<TField> | undefined;
  return override ? override.value : profile.generated[field];
}

/** The whole user-facing analysis with overrides applied. */
export function effectiveAnalysis(
  profile: EditableLibrarianProfile,
): LibrarianUserFacingAnalysis {
  const { schemaVersion, confidence, provenance, ...baseline } = profile.generated;
  void schemaVersion;
  void confidence;
  void provenance;

  return Object.values(profile.overrides)
    .filter((override): override is AnyFieldOverride => override !== undefined)
    .reduce<LibrarianUserFacingAnalysis>(
      (analysis, override) => ({ ...analysis, [override.field]: override.value }),
      baseline,
    );
}

export function setOverride<TField extends LibrarianField>(
  profile: EditableLibrarianProfile,
  field: TField,
  value: LibrarianUserFacingAnalysis[TField],
  now: number,
): EditableLibrarianProfile {
  return {
    generated: profile.generated,
    overrides: { ...profile.overrides, [field]: { field, value, updatedAt: now } },
  };
}

/** Reset removes one override so the generated value shows through again. */
export function clearOverride(
  profile: EditableLibrarianProfile,
  field: LibrarianField,
): EditableLibrarianProfile {
  const overrides = { ...profile.overrides };
  delete overrides[field];
  return { generated: profile.generated, overrides };
}

/** Reanalysis replaces `generated` only — manual fields survive untouched. */
export function replaceGenerated(
  profile: EditableLibrarianProfile,
  generated: LibrarianAnalysis,
): EditableLibrarianProfile {
  return { generated, overrides: profile.overrides };
}
