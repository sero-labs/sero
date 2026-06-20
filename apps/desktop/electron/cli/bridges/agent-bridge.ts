import type { AgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import type { AgentStreamEvent } from '@/types/ipc';
import { installCliSessionBridge } from './session-bridge';

const TURN_LIMIT = 50;
let turnSeq = 0;
const activeTurns = new Map<string, string>();
const turnBudgets = new Map<string, { turnId: string; count: number }>();

// ── Turn-lifecycle observation (Sero Orchestrator active-session seam) ────────
//
// `activeTurns` regenerates a turn id on every `turn_start` (per LLM round) for
// budget accounting. Background observers instead want one id that spans a whole
// agent loop, so it matches the id captured when the loop was kicked off. We
// track that loop id separately: set once at the loop's first `turn_start`,
// cleared and reported at `agent_end`. See capabilities/session-host.ts.

export type CliTurnStatus = 'completed' | 'aborted' | 'error';

export interface CliTurnCompletion {
  turnId: string;
  status: CliTurnStatus;
}

const loopTurns = new Map<string, string>();
const turnStartListeners = new Map<string, Set<(turnId: string) => void>>();
const turnCompleteListeners = new Map<string, Set<(completion: CliTurnCompletion) => void>>();

function emit<T>(listeners: Map<string, Set<(value: T) => void>>, sessionId: string, value: T): void {
  const set = listeners.get(sessionId);
  if (!set) return;
  for (const cb of [...set]) cb(value);
}

function subscribe<T>(
  listeners: Map<string, Set<(value: T) => void>>,
  sessionId: string,
  cb: (value: T) => void,
): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(cb);
  return () => {
    const current = listeners.get(sessionId);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) listeners.delete(sessionId);
  };
}

/** Observe loop-scoped turn completion for a session. Returns an unsubscribe fn. */
export function onCliTurnComplete(
  sessionId: string,
  cb: (completion: CliTurnCompletion) => void,
): () => void {
  return subscribe(turnCompleteListeners, sessionId, cb);
}

/**
 * Resolve with the loop turn id of the next agent loop that starts on this
 * session, or null if none starts within `timeoutMs`. Used to capture the
 * correlation id of the turn a send triggers (the send itself returns void).
 */
export function waitForCliTurnStart(sessionId: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (turnId: string | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(turnId);
    };
    const unsubscribe = subscribe(turnStartListeners, sessionId, (turnId) => finish(turnId));
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

interface AgentPoolEntryLike {
  session: AgentSession;
  loader: DefaultResourceLoader;
  workspaceId: string;
  lastSessionName: string | undefined;
}

interface InstallCliAgentBridgeOptions {
  getEntry: (sessionId: string) => AgentPoolEntryLike | undefined;
  listEntries: () => Array<[string, AgentPoolEntryLike]>;
  sendEvent: (event: AgentStreamEvent) => void;
}

function nextTurnId(): string {
  turnSeq += 1;
  return `turn-${Date.now()}-${turnSeq}`;
}

export function noteCliTurnStart(sessionId: string): void {
  const turnId = nextTurnId();
  activeTurns.set(sessionId, turnId);
  // First turn of a fresh agent loop: pin the loop id and announce the start.
  if (!loopTurns.has(sessionId)) {
    loopTurns.set(sessionId, turnId);
    emit(turnStartListeners, sessionId, turnId);
  }
}

export function noteCliTurnEnd(sessionId: string, status: CliTurnStatus = 'completed'): void {
  activeTurns.delete(sessionId);
  const turnId = loopTurns.get(sessionId);
  if (turnId === undefined) return;
  loopTurns.delete(sessionId);
  emit(turnCompleteListeners, sessionId, { turnId, status });
}

export function installCliAgentBridge(options: InstallCliAgentBridgeOptions): void {
  installCliSessionBridge({
    getSessionEntry(sessionId) {
      const entry = options.getEntry(sessionId);
      if (!entry) return undefined;
      return {
        sessionId,
        workspaceId: entry.workspaceId,
        session: entry.session,
        lastSessionName: entry.lastSessionName,
      };
    },

    getActiveSessionForWorkspace(workspaceId) {
      for (const [sessionId, entry] of options.listEntries()) {
        if (entry.workspaceId !== workspaceId) continue;
        if (!entry.session.agent.state.isStreaming) continue;
        return { sessionId, workspaceId, session: entry.session, lastSessionName: entry.lastSessionName };
      }
      for (const [sessionId, entry] of options.listEntries()) {
        if (entry.workspaceId === workspaceId) {
          return { sessionId, workspaceId, session: entry.session, lastSessionName: entry.lastSessionName };
        }
      }
      return undefined;
    },

    getActiveTurnId(sessionId) {
      return activeTurns.get(sessionId) ?? null;
    },

    noteTurnStart: noteCliTurnStart,
    noteTurnEnd: noteCliTurnEnd,

    consumeTurnBudget(workspaceId, turnId) {
      const key = workspaceId;
      const current = turnBudgets.get(key);
      if (!current || current.turnId !== turnId) {
        turnBudgets.set(key, { turnId, count: 1 });
        return { allowed: true, count: 1, limit: TURN_LIMIT };
      }
      if (current.count >= TURN_LIMIT) {
        return { allowed: false, count: current.count, limit: TURN_LIMIT };
      }
      current.count += 1;
      return { allowed: true, count: current.count, limit: TURN_LIMIT };
    },

    setSessionTitle(sessionId, title) {
      const entry = options.getEntry(sessionId);
      if (!entry) throw new Error(`No active session: ${sessionId}`);
      entry.session.setSessionName(title);
      if (entry.lastSessionName !== title) {
        entry.lastSessionName = title;
        options.sendEvent({ type: 'session_name', sessionId, name: title });
      }
    },
  });
}
