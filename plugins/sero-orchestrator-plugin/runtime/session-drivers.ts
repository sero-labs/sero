/**
 * One autonomous driver per chat session (D06).
 *
 * Orchestrator's active-session step executor and Goal mode both steer a live
 * session. Two of them on one session interleave steers and race turns, so the
 * coordinator arbitrates instead of the two negotiating a convention between
 * themselves. Both hold the same key — the host session id — and the second
 * one is refused with a reason rather than queued.
 *
 * Ordinary user turns are never affected. This governs autonomous drivers only.
 */

export type SessionDriverKind = 'workflow-step' | 'goal';

export interface SessionDriver {
  kind: SessionDriverKind;
  /** The loop id or goal id that holds the session, so a refusal can name it. */
  ownerId: string;
}

export type SessionDriverClaim = { ok: true } | { ok: false; holder: SessionDriver };

export class SessionDrivers {
  private readonly held = new Map<string, SessionDriver>();

  /** Takes the session for a driver. Re-taking it for the same owner succeeds. */
  claim(sessionId: string, driver: SessionDriver): SessionDriverClaim {
    const holder = this.held.get(sessionId);
    if (holder && holder.ownerId !== driver.ownerId) return { ok: false, holder };
    this.held.set(sessionId, driver);
    return { ok: true };
  }

  /** Releases the session, but only for the owner that holds it. */
  release(sessionId: string, ownerId: string): void {
    if (this.held.get(sessionId)?.ownerId === ownerId) this.held.delete(sessionId);
  }

  holderOf(sessionId: string): SessionDriver | undefined {
    return this.held.get(sessionId);
  }
}

/** One user-facing sentence naming who holds the session and why the caller cannot. */
export function describeDriverConflict(holder: SessionDriver): string {
  return holder.kind === 'goal'
    ? `goal ${holder.ownerId} is already driving this session`
    : `an active-session step of workflow ${holder.ownerId} is already driving this session`;
}
