/**
 * The system prompt changes a session's context editor holds.
 *
 * The context editor records them here. The Sero host extension applies them
 * at the start of each run, in its `before_agent_start` handler, which is the
 * supported place to replace a session's system prompt.
 */

export interface SessionPromptOverride {
  /** Replaces the base prompt. Omitted means the base prompt stays. */
  systemPrompt?: string;
  disabledSkills?: string[];
  /** The session's base prompt, as Pi builds it before any extension changes it. */
  basePrompt: () => string;
}

/** Keyed by the session's `SessionManager`, which the handler's context also carries. */
const overrides = new WeakMap<object, SessionPromptOverride>();

export function setSessionPromptOverride(sessionManager: object, override: SessionPromptOverride | null): void {
  if (override) overrides.set(sessionManager, override);
  else overrides.delete(sessionManager);
}

/**
 * Strip disabled skills from the `<available_skills>` section of a system
 * prompt. Each skill is wrapped in `<skill><name>…</name>…</skill>`.
 */
export function stripDisabledSkills(prompt: string, disabled: Set<string>): string {
  return prompt.replace(
    /<skill>\s*\n\s*<name>([^<]+)<\/name>[\s\S]*?<\/skill>/g,
    (match, name: string) => (disabled.has(name.trim()) ? '' : match),
  );
}

/**
 * Applies the session's override to the prompt a run is about to use.
 *
 * Plugin extensions run before the Sero host extension and append their blocks
 * to the base prompt. The override replaces the base part and keeps what they
 * appended.
 */
export function resolveSessionPrompt(sessionManager: object, currentPrompt: string): string {
  const override = overrides.get(sessionManager);
  if (!override) return currentPrompt;

  const applyTo = (prompt: string): string => {
    const replaced = override.systemPrompt ?? prompt;
    return override.disabledSkills?.length
      ? stripDisabledSkills(replaced, new Set(override.disabledSkills))
      : replaced;
  };

  const basePrompt = override.basePrompt();
  if (!currentPrompt.startsWith(basePrompt)) {
    // An earlier extension rewrote the base prompt, so its part cannot be told apart.
    console.warn('[context-editor] The base prompt changed before the override ran. The override replaces the whole prompt.');
    return applyTo(currentPrompt);
  }
  return applyTo(basePrompt) + currentPrompt.slice(basePrompt.length);
}
