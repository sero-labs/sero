/**
 * Sero built-in commands (registered by the sero extension factory).
 * These are NOT bridged to CLI — they either already have CLI equivalents
 * or are pure UI/session management that the agent shouldn't invoke.
 * DO NOT Add external plugins to this file - they must remain decoupled from the Sero host
 */
export const BUILTIN_COMMANDS: ReadonlySet<string> = new Set([
  'workspace', 'pwd',
  'reload', 'compact', 'name', 'session', 'model', 'thinking',
  'checkpoint', 'checkpoints', 'restore', 'diffcp',
  'admin',
]);
