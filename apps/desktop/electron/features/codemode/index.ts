/**
 * Pi's native Code Mode (`codemode`) for every Sero session type.
 *
 * Sero puts no layer between the model and the tool. One factory builds Pi's
 * extension and one call switches the tool on after the session exists, so a
 * chat session and a subagent session run the same code path.
 *
 * Pi registers `codemode` inactive, so switching it on is what makes it a base
 * tool the context editor lists and a user can disable.
 */
import {
  createCodemodeExtension,
  type AgentSession,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent';

export const CODEMODE_TOOL_NAME = 'codemode';

/** The part of a session this module needs to switch the tool on. */
export type CodemodeSession = Pick<AgentSession, 'getActiveToolNames' | 'setActiveToolsByName'>;

/**
 * Sero's Code Mode extension: `mode: 'on'` keeps the session's other tools
 * visible, and `models: false` keeps Pi's model catalogue and classifiers out
 * of scripts.
 */
export function createSeroCodemodeExtension(): ExtensionFactory {
  return createCodemodeExtension({ mode: 'on', models: false });
}

/** Switch `codemode` on for a session that loaded the extension. Switching twice has no effect. */
export function activateCodemode(session: CodemodeSession): void {
  const active = session.getActiveToolNames();
  if (active.includes(CODEMODE_TOOL_NAME)) return;
  session.setActiveToolsByName([...active, CODEMODE_TOOL_NAME]);
}
