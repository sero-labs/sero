import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  RTK_TOOLCHAIN_EVENT,
  type RtkToolchainRequest,
  type RtkToolchainResolution,
} from '@sero-ai/common';

/**
 * Ask the host for the verified RTK locations over the EventBus.
 *
 * Nothing is cached across calls: the host resolves the current runtime
 * identity each time, so an install that completes, a repaired binary, or a
 * replaced container is reflected without a restart. Concurrent calls share
 * one in-flight request.
 */
export class RtkResolver {
  private readonly events: EventBus;
  private sessionId: string;
  private workspaceId: string;
  private readonly timeoutMs: number;
  private inflight: Promise<RtkToolchainResolution> | null = null;

  constructor(events: EventBus, sessionId: string, workspaceId: string, timeoutMs = 15_000) {
    this.events = events;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.timeoutMs = timeoutMs;
  }

  setIdentity(sessionId: string, workspaceId: string): void {
    if (this.sessionId !== sessionId || this.workspaceId !== workspaceId) {
      // A new session or workspace must not reuse an answer for the old one.
      this.inflight = null;
    }
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
  }

  resolve(): Promise<RtkToolchainResolution> {
    if (this.inflight) return this.inflight;
    const wrapped = this.request().then((resolution) => {
      if (this.inflight === wrapped) this.inflight = null;
      return resolution;
    });
    this.inflight = wrapped;
    return wrapped;
  }

  private request(): Promise<RtkToolchainResolution> {
    return new Promise((resolve) => {
      let accepted = false;
      let settled = false;
      const finish = (resolution: RtkToolchainResolution): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(resolution);
      };
      const request: RtkToolchainRequest = {
        sessionId: this.sessionId,
        workspaceId: this.workspaceId,
        accept: () => { accepted = true; },
        resolve: (resolution) => finish(resolution),
      };
      const timer = setTimeout(
        () => finish({ state: 'failed', reason: 'RTK resolution timed out.' }),
        this.timeoutMs,
      );
      try {
        this.events.emit(RTK_TOOLCHAIN_EVENT, request);
      } catch (error) {
        finish({ state: 'failed', reason: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (!accepted) {
        finish({ state: 'failed', reason: 'The host did not answer the RTK resolution request.' });
      }
    });
  }
}
