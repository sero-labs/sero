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

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { WorkspaceManager } from '../workspace';
import type { ContainerState } from '../container/types';
import { buildContainerPromptBlock } from '../container/system-prompt';
import { buildCliPromptBlock } from '../cli';
import { showNotification, type NotificationType } from '../notifications';

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
) {
  return (pi: ExtensionAPI) => {
    // ── System prompt injection (CLI + container) ─────────────
    pi.on('before_agent_start', async (event) => {
      let systemPrompt = event.systemPrompt;
      systemPrompt += buildCliPromptBlock();

      if (containerState) {
        systemPrompt += buildContainerPromptBlock(
          currentWorkspaceId,
          containerState.ipAddress,
        );
      }

      if (systemPrompt !== event.systemPrompt) {
        return { systemPrompt };
      }
    });

    // ── sero:notify — shared notification bus ─────────────────
    pi.events.on('sero:notify', (data: unknown) => {
      const p = data as Record<string, unknown> | undefined;
      if (!p?.message || typeof p.message !== 'string') return;
      showNotification({
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
