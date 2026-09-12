import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  RTK_TOOLCHAIN_EVENT,
  type RtkToolchainRequest,
  type RtkToolchainResolution,
} from '@sero-ai/common';

/**
 * Ask the host for the verified RTK locations over the EventBus.
 *
 * Only an `available` answer is cached. An installation that completes after an
 * unavailable answer becomes usable on the next command without a restart.
 */
export class RtkResolver {
  private readonly events: EventBus;
  private sessionId: string;
  private workspaceId: string;
  private readonly timeoutMs: number;
  private cached: RtkToolchainResolution | null = null;
  private inflight: Promise<RtkToolchainResolution> | null = null;

  constructor(events: EventBus, sessionId: string, workspaceId: string, timeoutMs = 15_000) {
    this.events = events;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
    this.timeoutMs = timeoutMs;
  }

  setIdentity(sessionId: string, workspaceId: string): void {
    if (this.sessionId !== sessionId) this.cached = null;
    this.sessionId = sessionId;
    this.workspaceId = workspaceId;
  }

  /** Drop any cached answer, for the settings retry action. */
  invalidate(): void {
    this.cached = null;
  }

  resolve(): Promise<RtkToolchainResolution> {
    if (this.cached) return Promise.resolve(this.cached);
    if (this.inflight) return this.inflight;
    this.inflight = this.request().then((resolution) => {
      this.inflight = null;
      if (resolution.state === 'available') this.cached = resolution;
      return resolution;
    });
    return this.inflight;
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
