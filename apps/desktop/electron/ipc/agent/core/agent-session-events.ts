/**
 * Testable helpers for emitting session lifecycle events.
 *
 * Extracted from agent.ts so the critical shutdown / switch emit logic
 * can be unit-tested without standing up IPC or a full agent pool.
 */

import type {
  AgentSession,
  SessionBeforeSwitchEvent,
  SessionManager,
  SessionShutdownEvent,
  SessionStartEvent,
} from '@earendil-works/pi-coding-agent';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';

/**
 * The `session_start` event for a session about to open from `sessionManager`:
 * `fork` when the host just forked it from `forkedFrom`, `resume` when the file
 * already holds entries, and `startup` for a new session.
 */
export function sessionStartEventFor(
  sessionManager: SessionManager,
  forkedFrom?: string,
): SessionStartEvent {
  if (forkedFrom) return { type: 'session_start', reason: 'fork', previousSessionFile: forkedFrom };
  return { type: 'session_start', reason: sessionManager.getEntries().length > 0 ? 'resume' : 'startup' };
}

/**
 * Bind Sero's UI context and emit `session_start`. Pi emits the event only from
 * `bindExtensions()`, and the binding resets any UI context set before it, so
 * the UI context must go through here.
 */
export async function startSessionExtensions(session: AgentSession): Promise<void> {
  await session.bindExtensions({ uiContext: createSeroUIContext() });
}

/**
 * Emit `session_shutdown`, then dispose. A failing handler is logged and never
 * blocks disposal.
 */
export async function shutdownAndDispose(session: AgentSession, label: string): Promise<void> {
  try {
    await emitSessionShutdown(session);
  } catch (err) {
    console.error(`[agent] session_shutdown failed for ${label}:`, err);
  }
  session.dispose();
}

/**
 * Emit `session_shutdown` via the session's extension runner.
 *
 * The Pi SDK's `AgentSession.dispose()` does NOT fire this event,
 * so Sero must emit it manually before disposing pool entries.
 *
 * @returns true if the event was emitted, false if no runner was available
 */
export async function emitSessionShutdown(
  session: AgentSession,
): Promise<boolean> {
  const runner = session.extensionRunner;
  if (!runner) return false;

  const event: SessionShutdownEvent = { type: 'session_shutdown', reason: 'quit' };
  await runner.emit(event);
  return true;
}

/**
 * Emit `session_before_switch` via the session's extension runner.
 *
 * Used when the renderer switches focus away from a session so
 * extensions (e.g. memory) can export transcripts.
 *
 * @returns the handler result, or undefined if no runner was available
 */
export async function emitSessionBeforeSwitch(
  session: AgentSession,
  reason: SessionBeforeSwitchEvent['reason'],
): Promise<unknown> {
  const runner = session.extensionRunner;
  if (!runner) return undefined;

  const event: SessionBeforeSwitchEvent = {
    type: 'session_before_switch',
    reason,
  };
  return runner.emit(event);
}
