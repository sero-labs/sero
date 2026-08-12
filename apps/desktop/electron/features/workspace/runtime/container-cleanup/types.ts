import type { SeroContainerIdentity, SeroContainerProvider } from '@electron/features/container/core/ownership';

export interface WorkspaceContainerIdentity extends SeroContainerIdentity {
  profileId: string;
}

export interface ContainerDeletionRequest extends SeroContainerIdentity {
  createdBefore?: string;
  skipRunning?: boolean;
}

export interface PendingContainerDeletion extends WorkspaceContainerIdentity {
  provider: SeroContainerProvider;
  cancelWhenRegistered?: boolean;
  createdBefore?: string;
}

export interface OwnedWorkspaceContainer extends SeroContainerIdentity {
  provider: SeroContainerProvider;
  containerId: string;
}
export type ContainerDeletionResult = 'deleted' | 'absent' | 'preserved' | 'superseded';

export interface ContainerCleanupProvider {
  readonly provider: SeroContainerProvider;
  listOwned(profileRoots: string[]): Promise<OwnedWorkspaceContainer[]>;
  deleteOwned(request: ContainerDeletionRequest): Promise<ContainerDeletionResult>;
}

export interface ContainerCleanupState {
  version: 1;
  pending: PendingContainerDeletion[];
}

export interface ReconciliationResult {
  pending: number;
  deleted: number;
  preserved: number;
  providerFailures: number;
  registryComplete: boolean;
}
