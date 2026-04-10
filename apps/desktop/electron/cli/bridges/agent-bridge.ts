import type { AgentSession, DefaultResourceLoader } from '@mariozechner/pi-coding-agent';
import type { AgentStreamEvent } from '@/types/ipc';
import { installCliSessionBridge } from './session-bridge';

const TURN_LIMIT = 50;
let turnSeq = 0;
const activeTurns = new Map<string, string>();
const turnBudgets = new Map<string, { turnId: string; count: number }>();

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
  activeTurns.set(sessionId, nextTurnId());
}

export function noteCliTurnEnd(sessionId: string): void {
  activeTurns.delete(sessionId);
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
