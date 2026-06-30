/**
 * Context-editor contracts — shared between the desktop chat session editor and
 * Sero app modules (e.g. the Orchestrator loop context override).
 *
 * Renderer-safe (no Node imports). The chat editor applies these overrides to a
 * live agent session; an app module may persist them on its own entity (a loop)
 * and apply them to the background subagents it spawns. The data shape is the
 * same in both cases.
 */

/** Tool info for the context editor (renderer-safe, no execute function). */
export interface ContextToolInfo {
  name: string;
  label?: string;
  description?: string;
}

/** Skill info for the context editor. */
export interface ContextSkillInfo {
  name: string;
  description?: string;
  filePath?: string;
}

/** A named agent role available to a workspace's background subagents. */
export interface ContextAgentInfo {
  /** Agent name (frontmatter `name` / the `.md` filename). */
  name: string;
  /** What the agent does (frontmatter `description`). */
  description?: string;
}

/** Context overrides authored in the editor. */
export interface ContextOverrides {
  /**
   * Custom system-prompt text. How it is applied depends on the consumer: the
   * chat session editor replaces the base prompt; an app module may append it as
   * additional instructions. `null`/omitted means "no override".
   */
  systemPrompt?: string | null;
  /** Tool names to disable (removed from the tool surface). */
  disabledTools?: string[];
  /** Skill names to disable. */
  disabledSkills?: string[];
}

/** A saved context-editor preset (persisted to disk via IPC, profile-level). */
export interface ContextPreset {
  id: string;
  name: string;
  /** If null, use the default. If a string, override with this. */
  systemPrompt: string | null;
  /** Tool names to disable. `['__all__']` means every tool. */
  disabledTools: string[];
  /** Skill names to disable. `['__all__']` means every skill. */
  disabledSkills: string[];
}

/**
 * The full set of context a target exposes, before any per-target override is
 * applied. The chat editor sources this from a live session; an app module
 * sources it from the subagent context of its workspace.
 */
export interface AvailableContext {
  /** Base system prompt before any overrides. Empty when the consumer treats the override as additive. */
  systemPrompt: string;
  /** Full tool list available before per-target filtering. */
  tools: ContextToolInfo[];
  /** Full skill list available before per-target filtering. */
  skills: ContextSkillInfo[];
  /** Named agent roles available to this workspace's background subagents. */
  agents?: ContextAgentInfo[];
  /** Currently applied overrides, if any. */
  overrides: ContextOverrides | null;
}

/** Back-compat alias — the chat session editor names this `SessionContext`. */
export type SessionContext = AvailableContext;
