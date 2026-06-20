// Recursion guardrail (D-16). Orchestrator-generated workers must not create,
// modify, or run orchestrator loops. The ENFORCED guard is coordinator-side:
// `requestAction` rejects any control request whose invocation source is an
// orchestrator worker session. (A filtered `sero-cli` surface that hides
// `orchestrator.*` from workers is optional defense-in-depth, Phase 6.)
//
// A worker runs as a subagent whose session id is `subagent-<parent>-<ts>` (see
// the subagent runner). Two signals identify one:
//   • the synthetic parent the orchestrator always uses (`orchestrator:<loopId>`)
//     — recognizable by prefix, durable across restart; covers the common case;
//   • a live registry of the parent session ids under which the coordinator is
//     currently running workers — covers loops bound to a real user session
//     (D-15), where the name alone is indistinguishable from a normal subagent.

/** The synthetic parent the coordinator uses when a loop has no bound session (D-15). */
export const ORCHESTRATOR_SESSION_PREFIX = 'orchestrator:';

/** Tracks the parent session ids of in-flight orchestrator workers. */
export class WorkerSessionRegistry {
  // Ref-counted: many loops can run workers concurrently under distinct parents.
  private readonly active = new Map<string, number>();

  /** Mark a worker's parent session id active for the duration of its run. */
  markActive(parentSessionId: string): void {
    this.active.set(parentSessionId, (this.active.get(parentSessionId) ?? 0) + 1);
  }

  /** Release one hold on a parent session id once its worker finishes. */
  clear(parentSessionId: string): void {
    const count = this.active.get(parentSessionId);
    if (count === undefined) return;
    if (count <= 1) this.active.delete(parentSessionId);
    else this.active.set(parentSessionId, count - 1);
  }

  /**
   * Whether a request's source session id belongs to an orchestrator worker.
   * Matches the synthetic-parent naming convention and any live worker parent.
   */
  isWorkerSession(sessionId: string | null | undefined): boolean {
    if (!sessionId) return false;
    // The synthetic parent itself, or a subagent spawned beneath it.
    if (
      sessionId.startsWith(ORCHESTRATOR_SESSION_PREFIX) ||
      sessionId.startsWith(`subagent-${ORCHESTRATOR_SESSION_PREFIX}`)
    ) {
      return true;
    }
    // A subagent spawned beneath a currently-running worker's parent session.
    for (const parent of this.active.keys()) {
      if (sessionId === parent || sessionId.startsWith(`subagent-${parent}-`)) return true;
    }
    return false;
  }
}
