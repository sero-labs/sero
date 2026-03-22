/**
 * Shared helpers for global skill visibility preferences.
 *
 * Sero keeps user-controlled skill visibility in settings.json under:
 *
 * {
 *   "sero": {
 *     "skillVisibility": {
 *       "disabledModelSkills": ["skill-name"]
 *     }
 *   }
 * }
 *
 * This lets users hide rarely used skills from the always-on
 * `<available_skills>` prompt block without uninstalling them.
 */

export const SERO_SETTINGS_KEY = 'sero';
export const SKILL_VISIBILITY_SETTINGS_KEY = 'skillVisibility';
export const DISABLED_MODEL_SKILLS_KEY = 'disabledModelSkills';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSkillNames(skillNames: Iterable<string>): string[] {
  return [...new Set(
    [...skillNames]
      .map((name) => name.trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

/** Read the user-configured set of skills hidden from automatic model invocation. */
export function getDisabledModelSkills(settings: unknown): string[] {
  if (!isRecord(settings)) return [];

  const sero = settings[SERO_SETTINGS_KEY];
  if (!isRecord(sero)) return [];

  const skillVisibility = sero[SKILL_VISIBILITY_SETTINGS_KEY];
  if (!isRecord(skillVisibility)) return [];

  const disabled = skillVisibility[DISABLED_MODEL_SKILLS_KEY];
  if (!Array.isArray(disabled)) return [];

  return normalizeSkillNames(
    disabled.filter((name): name is string => typeof name === 'string'),
  );
}

/**
 * Return a cloned settings object with the disabled skill list updated.
 * Empty nested objects are removed so settings.json stays tidy.
 */
export function withDisabledModelSkills<T extends Record<string, unknown>>(
  settings: T,
  disabledSkills: Iterable<string>,
): T {
  const normalized = normalizeSkillNames(disabledSkills);
  const next: Record<string, unknown> = { ...settings };

  const currentSero = isRecord(settings[SERO_SETTINGS_KEY])
    ? settings[SERO_SETTINGS_KEY]
    : {};
  const nextSero: Record<string, unknown> = { ...currentSero };

  const currentVisibility = isRecord(currentSero[SKILL_VISIBILITY_SETTINGS_KEY])
    ? currentSero[SKILL_VISIBILITY_SETTINGS_KEY]
    : {};
  const nextVisibility: Record<string, unknown> = { ...currentVisibility };

  if (normalized.length > 0) {
    nextVisibility[DISABLED_MODEL_SKILLS_KEY] = normalized;
    nextSero[SKILL_VISIBILITY_SETTINGS_KEY] = nextVisibility;
    next[SERO_SETTINGS_KEY] = nextSero;
    return next as T;
  }

  delete nextVisibility[DISABLED_MODEL_SKILLS_KEY];
  if (Object.keys(nextVisibility).length > 0) {
    nextSero[SKILL_VISIBILITY_SETTINGS_KEY] = nextVisibility;
  } else {
    delete nextSero[SKILL_VISIBILITY_SETTINGS_KEY];
  }

  if (Object.keys(nextSero).length > 0) {
    next[SERO_SETTINGS_KEY] = nextSero;
  } else {
    delete next[SERO_SETTINGS_KEY];
  }

  return next as T;
}
