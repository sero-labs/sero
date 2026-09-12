import { SessionMetrics } from './metrics';

/** Per-session state. Each extension instance owns one of these. */

export interface RewriteRecord {
  requested: string;
  executed: string;
}

export class SessionState {
  readonly metrics = new SessionMetrics();
  private sessionId = '';
  private readonly rewrites = new Map<string, RewriteRecord>();
  private readonly accounted = new Set<string>();

  setSessionId(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.rewrites.clear();
    this.accounted.clear();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  recordRewrite(toolCallId: string, record: RewriteRecord): void {
    this.rewrites.set(toolCallId, record);
  }

  takeRewrite(toolCallId: string): RewriteRecord | undefined {
    const record = this.rewrites.get(toolCallId);
    this.rewrites.delete(toolCallId);
    return record;
  }

  /** True the first time a tool call is accounted for. Guards replay double counting. */
  claimAccounting(toolCallId: string): boolean {
    if (this.accounted.has(toolCallId)) return false;
    this.accounted.add(toolCallId);
    return true;
  }
}
