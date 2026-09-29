/**
 * Session-runtime bridge types shared between the desktop host and plugins.
 * Keep renderer-safe and free of desktop-/Electron-specific imports.
 */

/**
 * Channel the host emits once per session with the Sero CLI commands that
 * session can run. A plugin prompt block that names one of its own commands
 * checks this list, because an allowlist can hide a plugin tool without
 * bridging its command. `buildCliPromptBlock` lists the same commands.
 */
export const SESSION_CLI_SURFACE_EVENT = 'sero:session-cli-surface';

/** Payload of `SESSION_CLI_SURFACE_EVENT`. */
export interface SessionCliSurface {
  /** Sero CLI command names visible to this session. */
  commands: readonly string[];
}

/**
 * Track the CLI commands a session can run from the host's session-start
 * announcement. A session kind that does not announce keeps the optimistic
 * answer, so a plugin hint is only suppressed when the host said it is hidden.
 */
export function trackSessionCliSurface(
  events: { on: (channel: string, handler: (data: unknown) => void) => unknown } | undefined,
): { has: (command: string) => boolean } {
  if (!events) return { has: () => true };
  let commands: Set<string> | null = null;
  events.on(SESSION_CLI_SURFACE_EVENT, (data) => {
    const announced = (data as { commands?: unknown } | undefined)?.commands;
    if (!Array.isArray(announced)) return;
    commands = new Set(announced.filter((name): name is string => typeof name === 'string'));
  });
  return { has: (command) => commands === null || commands.has(command) };
}

/** The part of the extension tool surface `canRunSeroCommand` reads. */
interface SeroCommandToolSurface {
  getActiveTools(): readonly string[];
  getAllTools(): ReadonlyArray<{ name: string }>;
}

/**
 * Whether a session can run every named Sero CLI command.
 *
 * A prompt block names one or more commands. This keeps it from naming a
 * command the session cannot run: the session must have `sero-cli`, none of
 * the names may be a direct tool, and the announced surface must list them
 * all. A session that never announced a surface stays optimistic, so a plugin
 * hint is only suppressed when the host said the command is hidden.
 */
export function canRunSeroCommand(
  pi: SeroCommandToolSurface,
  surface: { has: (command: string) => boolean },
  ...commands: string[]
): boolean {
  if (commands.length === 0) return false;
  if (!pi.getActiveTools().includes('sero-cli')) return false;
  // A command the session also has as a direct tool needs no prompt line.
  if (commands.some((command) => pi.getAllTools().some((tool) => tool.name === command))) return false;
  return commands.every((command) => surface.has(command));
}

export interface ExtensionRuntimeTextContent {
  type: 'text';
  text: string;
}

export interface ExtensionRuntimeImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type ExtensionRuntimeContentBlock =
  | ExtensionRuntimeTextContent
  | ExtensionRuntimeImageContent;

export type ExtensionRuntimeContent = string | ExtensionRuntimeContentBlock[];

export interface ExtensionRuntimeMessage {
  customType: string;
  content: ExtensionRuntimeContent;
  display: boolean;
  details?: unknown;
}

/**
 * Narrow execution-scoped runtime forwarded into bridged extension execution.
 * This stays intentionally small so plugins do not depend on raw host internals.
 */
export interface ExtensionSessionRuntime {
  sendUserMessage: (
    content: ExtensionRuntimeContent,
    options?: { deliverAs?: 'steer' | 'followUp' },
  ) => void | Promise<void>;
  sendMessage: (
    message: ExtensionRuntimeMessage,
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ) => void | Promise<void>;
}
