import path from 'path';
import type { ProfileInfo } from '@/types/profile';
import { PROFILE_REGISTRY_PATH } from '@electron/features/profile/manager';
import { createAppleContainerCleanupProvider, createDockerCleanupProvider } from './providers';
import { readRegisteredWorkspaceIdentities } from './registries';
import { ContainerCleanupService } from './service';

export type {
  ContainerCleanupProvider,
  ContainerDeletionResult,
  OwnedWorkspaceContainer,
  PendingContainerDeletion,
  ReconciliationResult,
  WorkspaceContainerIdentity,
} from './types';
export { ContainerCleanupService } from './service';
export { createAppleContainerCleanupProvider, createDockerCleanupProvider } from './providers';
export { readProfileWorkspaceIdentities, readRegisteredWorkspaceIdentities } from './registries';

export const containerCleanupService = new ContainerCleanupService(
  path.join(path.dirname(PROFILE_REGISTRY_PATH), 'container-cleanup.json'),
  [createAppleContainerCleanupProvider(), createDockerCleanupProvider()],
);

export async function reconcileRegisteredProfileContainers(
  profiles: Array<Pick<ProfileInfo, 'id' | 'path'>>,
): Promise<void> {
  const registered = await readRegisteredWorkspaceIdentities(profiles);
  const result = await containerCleanupService.reconcile(
    registered.workspaces,
    registered.complete,
    profiles.map((profile) => profile.path),
  );
  if (result.pending > 0 || result.providerFailures > 0 || !result.registryComplete) {
    console.warn('[container-cleanup] Reconciliation remains pending:', result);
  }
}
