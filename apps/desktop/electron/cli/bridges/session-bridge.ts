import type { AgentSession } from '@earendil-works/pi-coding-agent';

export interface CliSessionEntry {
  sessionId: string;
  workspaceId: string;
  session: AgentSession;
  lastSessionName?: string;
}

export interface CliSessionBridge {
  getSessionEntry(sessionId: string): CliSessionEntry | undefined;
  getActiveSessionForWorkspace(workspaceId: string): CliSessionEntry | undefined;
  getActiveTurnId(sessionId: string): string | null;
  noteTurnStart(sessionId: string): void;
  noteTurnEnd(sessionId: string): void;
  consumeTurnBudget(workspaceId: string, turnId: string): { allowed: boolean; count: number; limit: number };
  setSessionTitle(sessionId: string, title: string): void;
}

let bridge: CliSessionBridge | null = null;

export function installCliSessionBridge(next: CliSessionBridge): void {
  bridge = next;
}

export function getCliSessionBridge(): CliSessionBridge {
  if (!bridge) {
    throw new Error('CLI session bridge is not installed');
  }
  return bridge;
}
