import { promises as fs } from 'fs';
import path from 'path';
import { identitiesMatch, type SeroContainerProvider } from '@electron/features/container/core/ownership';
import type {
  ContainerCleanupProvider,
  ContainerCleanupState,
  PendingContainerDeletion,
  ReconciliationResult,
  WorkspaceContainerIdentity,
} from './types';

const EMPTY_RESULT: ReconciliationResult = {
  pending: 0,
  deleted: 0,
  preserved: 0,
  providerFailures: 0,
  registryComplete: true,
};

export class ContainerCleanupService {
  private serial: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly statePath: string,
    private readonly providers: ContainerCleanupProvider[],
  ) {}

  queueDeletion(
    identity: WorkspaceContainerIdentity,
    providers: SeroContainerProvider[] = ['apple-container', 'docker'],
  ): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.readState();
      for (const provider of providers) {
        this.addPending(state, { provider, ...identity, cancelWhenRegistered: true });
      }
      await this.writeState(state);
    });
  }

  queueRuntimeDeletion(
    identity: WorkspaceContainerIdentity,
    providers: SeroContainerProvider[] = ['apple-container', 'docker'],
  ): Promise<void> {
    return this.exclusive(async () => {
      const state = await this.readState();
      for (const provider of providers) {
        this.addPending(state, { provider, ...identity, cancelWhenRegistered: false });
      }
      await this.writeState(state);
    });
  }

  requestDeletion(
    identity: WorkspaceContainerIdentity,
    providers: SeroContainerProvider[] = ['apple-container', 'docker'],
  ): Promise<ReconciliationResult> {
    return this.exclusive(async () => {
      const state = await this.readState();
      for (const provider of providers) {
        this.addPending(state, { provider, ...identity, cancelWhenRegistered: true });
      }
      await this.writeState(state);
      return this.retryState(state);
    });
  }

  retryPending(): Promise<ReconciliationResult> {
    return this.exclusive(async () => this.retryState(await this.readState()));
  }

  reconcile(
    validWorkspaces: WorkspaceContainerIdentity[],
    registryComplete: boolean,
  ): Promise<ReconciliationResult> {
    return this.exclusive(async () => {
      const state = await this.readState();
      if (registryComplete) {
        const pendingBeforeValidation = state.pending.length;
        state.pending = state.pending.filter((pending) =>
          pending.cancelWhenRegistered === false
          || !validWorkspaces.some((workspace) => identitiesMatch(pending, workspace)));
        if (state.pending.length !== pendingBeforeValidation) await this.writeState(state);
      }
      const result = await this.retryState(state);
      result.registryComplete = registryComplete;
      if (!registryComplete) return result;
      let added = false;
      for (const provider of this.providers) {
        try {
          const containers = await provider.listOwned();
          for (const container of containers) {
            const exists = validWorkspaces.some((workspace) => identitiesMatch(container, workspace));
            if (exists) continue;
            this.addPending(state, {
              provider: provider.provider,
              profileId: '',
              workspaceId: container.workspaceId,
              workspacePath: container.workspacePath,
              cancelWhenRegistered: true,
            });
            added = true;
          }
        } catch (error) {
          result.providerFailures += 1;
          console.warn(`[container-cleanup] Could not list ${provider.provider} containers:`, error);
        }
      }
      if (added) await this.writeState(state);
      const orphanResult = await this.retryState(state);
      return {
        pending: orphanResult.pending,
        deleted: result.deleted + orphanResult.deleted,
        preserved: result.preserved + orphanResult.preserved,
        providerFailures: result.providerFailures + orphanResult.providerFailures,
        registryComplete,
      };
    });
  }

  private async retryState(state: ContainerCleanupState): Promise<ReconciliationResult> {
    const result = { ...EMPTY_RESULT };
    const remaining: PendingContainerDeletion[] = [];
    for (const pending of state.pending) {
      const provider = this.providers.find((candidate) => candidate.provider === pending.provider);
      if (!provider) {
        remaining.push(pending);
        result.providerFailures += 1;
        continue;
      }
      try {
        const outcome = await provider.deleteOwned(pending);
        if (outcome === 'deleted') result.deleted += 1;
        if (outcome === 'preserved') {
          result.preserved += 1;
          remaining.push(pending);
        }
      } catch (error) {
        remaining.push(pending);
        result.providerFailures += 1;
        console.warn(`[container-cleanup] Could not delete ${pending.provider} container for ${pending.workspaceId}:`, error);
      }
    }
    state.pending = remaining;
    result.pending = remaining.length;
    await this.writeState(state);
    return result;
  }

  private addPending(state: ContainerCleanupState, entry: PendingContainerDeletion): void {
    const existing = state.pending.find((candidate) =>
      candidate.provider === entry.provider && identitiesMatch(candidate, entry));
    if (!existing) {
      state.pending.push(entry);
      return;
    }
    if (entry.cancelWhenRegistered === false) existing.cancelWhenRegistered = false;
  }

  private async readState(): Promise<ContainerCleanupState> {
    let raw: string;
    try {
      raw = await fs.readFile(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, pending: [] };
      throw error;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isCleanupState(parsed)) return parsed;
      console.warn(`[container-cleanup] Invalid cleanup state ${this.statePath}; resetting it`);
    } catch (error) {
      console.warn(`[container-cleanup] Could not parse cleanup state ${this.statePath}; resetting it:`, error);
    }
    return { version: 1, pending: [] };
  }

  private async writeState(state: ContainerCleanupState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.statePath);
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.serial.then(operation, operation);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}

function isCleanupState(value: unknown): value is ContainerCleanupState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ContainerCleanupState>;
  return candidate.version === 1
    && Array.isArray(candidate.pending)
    && candidate.pending.every((entry) => isPendingDeletion(entry));
}

function isPendingDeletion(value: unknown): value is PendingContainerDeletion {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PendingContainerDeletion>;
  return (entry.provider === 'apple-container' || entry.provider === 'docker')
    && typeof entry.profileId === 'string'
    && typeof entry.workspaceId === 'string'
    && typeof entry.workspacePath === 'string'
    && path.isAbsolute(entry.workspacePath)
    && (entry.cancelWhenRegistered === undefined || typeof entry.cancelWhenRegistered === 'boolean');
}
