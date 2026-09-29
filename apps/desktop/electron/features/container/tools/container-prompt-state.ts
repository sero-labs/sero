import type { ContainerState } from '@electron/features/container/core/types';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { containerManager } from '@electron/shared/infra/shared-infra';

/** What the container prompt block needs from the running container. */
export type ContainerPromptState = Pick<ContainerState, 'ipAddress'>;

/** The container facts for a session's prompt, or undefined when the runtime is the host. */
export function containerPromptState(runtime: RuntimeBackend): ContainerPromptState | undefined {
  if (runtime.backend === 'host') return undefined;
  return { ipAddress: containerManager.getIpAddress(runtime.workspaceId) };
}
