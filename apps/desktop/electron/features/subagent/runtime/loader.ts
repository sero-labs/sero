/**
 * Subagent extension factory — reduced version of the main Sero extension.
 *
 * Provides:
 *   - Container + CLI prompt injection
 *   - @ws: path expansion
 *   - sero:notify event bus → desktop notifications
 *
 * Does NOT provide:
 *   - subagent / create_agent tools (no recursion)
 *   - External extension package loading
 *   - /reload, /compact, /name etc. (not relevant for child sessions)
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { ContainerState } from '@electron/features/container/core/types';
import { buildContainerPromptBlock } from '@electron/features/container/tools/system-prompt';
import { buildCliPromptBlock } from '@electron/cli';
import { logProviderRequest } from '@electron/ipc/editor/debug';
import { notify } from '@electron/features/notifications/feed';
import type { NotificationType } from '@electron/features/notifications/types';
import { registerSharedIsolatedCompletionHost } from '@electron/shared/infra/isolated-completion-host';
import { registerAgentPluginHostCapability } from '@electron/features/agent-plugins/host-capability';

/**
 * Creates a reduced extension factory for subagent child sessions.
 *
 * Injects standard Sero CLI + container prompt blocks but excludes
 * agent management tools and external extension packages.
 */
export function createSubagentExtensionFactory(
  wsManager: WorkspaceManager,
  currentWorkspaceId: string,
  _sessionId: string,
  containerState?: ContainerState,
  containerCwd?: string,
) {
  return (pi: ExtensionAPI) => {
    registerSharedIsolatedCompletionHost(pi.events);
    registerAgentPluginHostCapability(pi.events);

    // ── System prompt injection (CLI + container) ─────────────
    pi.on('before_agent_start', async (event) => {
      let systemPrompt = event.systemPrompt;
      systemPrompt += buildCliPromptBlock(undefined, {
        workspaceId: currentWorkspaceId,
        sessionId: _sessionId,
      });

      if (containerState) {
        systemPrompt += buildContainerPromptBlock(
          currentWorkspaceId,
          containerState.ipAddress,
          { currentWorkingDir: containerCwd },
        );
      }

      if (systemPrompt !== event.systemPrompt) {
        return { systemPrompt };
      }
    });

    pi.on('before_provider_request', async (event) => {
      logProviderRequest(_sessionId, event.payload);
    });

    // ── sero:notify — shared notification bus ─────────────────
    pi.events.on('sero:notify', (data: unknown) => {
      const p = data as Record<string, unknown> | undefined;
      if (!p?.message || typeof p.message !== 'string') return;
      notify({
        message: p.message,
        type: (['info', 'warning', 'error'].includes(p.type as string)
          ? p.type : 'info') as NotificationType,
        source: typeof p.source === 'string' ? p.source : undefined,
        sound: typeof p.sound === 'string' || typeof p.sound === 'boolean' ? p.sound : undefined,
        subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
      });
    });
  };
}
