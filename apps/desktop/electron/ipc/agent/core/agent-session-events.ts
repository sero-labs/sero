/**
 * Testable helpers for emitting session lifecycle events.
 *
 * Extracted from agent.ts so the critical shutdown / switch emit logic
 * can be unit-tested without standing up IPC or a full agent pool.
 */

import type {
  AgentSession,
  SessionBeforeSwitchEvent,
  SessionShutdownEvent,
} from '@mariozechner/pi-coding-agent';

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
