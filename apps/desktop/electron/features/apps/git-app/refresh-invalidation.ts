import path from 'node:path';

const DEFAULT_REFRESH_DEBOUNCE_MS = 200;

export interface GitRefreshTarget {
  workspaceId: string;
  stateFilePath: string;
  refresh: () => Promise<void>;
}

export interface GitRefreshInvalidationOptions {
  delayMs?: number;
  skipIfRefreshedWithinMs?: number;
}

interface RegisteredGitRefreshTarget extends GitRefreshTarget {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  refreshInFlight: Promise<void> | null;
  refreshQueued: boolean;
  lastRefreshCompletedAt: number;
}

export class GitRefreshInvalidationCoordinator {
  private readonly targetsByStateFile = new Map<string, RegisteredGitRefreshTarget>();
  private readonly stateFileByWorkspaceId = new Map<string, string>();

  registerTarget(target: GitRefreshTarget): void {
    const existing = this.targetsByStateFile.get(target.stateFilePath);
    if (existing) {
      existing.workspaceId = target.workspaceId;
      existing.refresh = target.refresh;
      this.stateFileByWorkspaceId.set(target.workspaceId, target.stateFilePath);
      return;
    }

    this.targetsByStateFile.set(target.stateFilePath, {
      ...target,
      debounceTimer: null,
      refreshInFlight: null,
      refreshQueued: false,
      lastRefreshCompletedAt: 0,
    });
    this.stateFileByWorkspaceId.set(target.workspaceId, target.stateFilePath);
  }

  unregisterTarget(stateFilePath: string): void {
    const target = this.targetsByStateFile.get(stateFilePath);
    if (!target) return;

    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
      target.debounceTimer = null;
    }

    this.targetsByStateFile.delete(stateFilePath);
    const mapped = this.stateFileByWorkspaceId.get(target.workspaceId);
    if (mapped === stateFilePath) {
      this.stateFileByWorkspaceId.delete(target.workspaceId);
    }
  }

  markRefreshed(stateFilePath: string): void {
    const target = this.targetsByStateFile.get(stateFilePath);
    if (!target) return;
    target.lastRefreshCompletedAt = Date.now();
  }

  invalidateWorkspace(
    workspaceId: string,
    reason: string,
    options: GitRefreshInvalidationOptions = {},
  ): void {
    const stateFilePath = this.stateFileByWorkspaceId.get(workspaceId);
    if (!stateFilePath) return;
    this.invalidateStateFile(stateFilePath, reason, options);
  }

  invalidateStateFile(
    stateFilePath: string,
    reason: string,
    options: GitRefreshInvalidationOptions = {},
  ): void {
    const target = this.targetsByStateFile.get(stateFilePath);
    if (!target) return;

    const freshnessWindow = options.skipIfRefreshedWithinMs ?? 0;
    if (
      freshnessWindow > 0 &&
      target.lastRefreshCompletedAt > 0 &&
      Date.now() - target.lastRefreshCompletedAt <= freshnessWindow
    ) {
      return;
    }

    this.scheduleRefresh(
      target,
      options.delayMs ?? DEFAULT_REFRESH_DEBOUNCE_MS,
      reason,
    );
  }

  private scheduleRefresh(
    target: RegisteredGitRefreshTarget,
    delayMs: number,
    reason: string,
  ): void {
    if (target.debounceTimer) clearTimeout(target.debounceTimer);
    target.debounceTimer = setTimeout(() => {
      target.debounceTimer = null;
      void this.runRefresh(target, reason);
    }, delayMs);
  }

  private async runRefresh(target: RegisteredGitRefreshTarget, reason: string): Promise<void> {
    if (target.refreshInFlight) {
      target.refreshQueued = true;
      return target.refreshInFlight;
    }

    target.refreshInFlight = target.refresh()
      .then(() => {
        target.lastRefreshCompletedAt = Date.now();
      })
      .catch((error) => {
        console.error(
          `[git-app] Failed to refresh ${path.basename(target.stateFilePath)} after ${reason}:`,
          error,
        );
      })
      .finally(() => {
        target.refreshInFlight = null;
        if (target.refreshQueued) {
          target.refreshQueued = false;
          this.scheduleRefresh(target, 0, `${reason}:queued`);
        }
      });

    return target.refreshInFlight;
  }
}

export const gitRefreshInvalidationCoordinator = new GitRefreshInvalidationCoordinator();
