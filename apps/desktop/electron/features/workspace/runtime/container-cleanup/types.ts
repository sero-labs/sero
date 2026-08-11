import type { SeroContainerIdentity, SeroContainerProvider } from '@electron/features/container/core/ownership';

export interface WorkspaceContainerIdentity extends SeroContainerIdentity {
  profileId: string;
}

export interface PendingContainerDeletion extends WorkspaceContainerIdentity {
  provider: SeroContainerProvider;
}

export interface OwnedWorkspaceContainer extends SeroContainerIdentity {
  provider: SeroContainerProvider;
  containerId: string;
}

export type ContainerDeletionResult = 'deleted' | 'absent' | 'preserved';

export interface ContainerCleanupProvider {
  readonly provider: SeroContainerProvider;
  listOwned(): Promise<OwnedWorkspaceContainer[]>;
  deleteOwned(identity: SeroContainerIdentity): Promise<ContainerDeletionResult>;
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
