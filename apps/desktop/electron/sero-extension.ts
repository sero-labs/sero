/**
 * Sero workspace extension factory.
 *
 * Injected as an inline extension factory into each AgentSession's
 * DefaultResourceLoader. Has closure access to the WorkspaceManager.
 *
 * Provides:
 *   - Container + CLI prompt injection (before_agent_start)
 *   - @ws:id/path expansion in user input (input event)
 *   - sero:notify event bus → desktop notifications (all extensions)
 *   - /workspace command (list, info, open, close)
 *   - /pwd command (print workspace-relative cwd)
 *   - PI CLI built-in equivalents: /reload, /compact, /name, /session, /model, /thinking
 */

import path from 'path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { WorkspaceManager } from './workspace';
import type { ContainerState } from './container/index';
import { buildContainerPromptBlock } from './container/system-prompt';
import { registerSeroBuiltinCommands } from './sero-extension-commands';
import { buildCliPromptBlock } from './cli';
import { registerGitCheckpointFeatures } from './sero-extension-git';
import { showNotification, type NotificationType } from './notifications';
import { logProviderRequest } from './ipc/debug';
import { registerSubagentTool, registerCreateAgentTool } from './subagent/tool';
import { buildSubagentPromptBlock } from './subagent/prompt';
import type { SubagentManager } from './subagent/index';

/**
 * Creates an extension factory for a specific workspace session.
 *
 * @param wsManager - The workspace manager (has composite state)
 * @param currentWorkspaceId - The workspace this session belongs to
 * @param containerState - Container state if workspace has a running container
 */
export interface SeroExtensionOptions {
  subagentManager?: SubagentManager;
  enableAgentManagementTools?: boolean;
}

export function createSeroExtensionFactory(
  wsManager: WorkspaceManager,
  currentWorkspaceId: string,
  _sessionId: string,
  containerState?: ContainerState,
  options?: SeroExtensionOptions,
) {
  return (pi: ExtensionAPI) => {
    // ── System prompt injection ───────────────────────────────

    pi.on('before_agent_start', async (event) => {
      let systemPrompt = event.systemPrompt;
      systemPrompt += buildCliPromptBlock();

      // Inject container environment context if workspace is containerised
      if (containerState) {
        systemPrompt += buildContainerPromptBlock(
          currentWorkspaceId,
          containerState.ipAddress,
        );
      }

      // Inject subagent guidance for main sessions
      if (options?.enableAgentManagementTools) {
        systemPrompt += buildSubagentPromptBlock();
      }

      if (systemPrompt !== event.systemPrompt) {
        return { systemPrompt };
      }
    });

    pi.on('before_provider_request', async (event) => {
      logProviderRequest(_sessionId, event.payload);
    });

    // ── sero:notify — shared notification bus ───────────────────
    //
    // Any extension can emit 'sero:notify' on pi.events to show a
    // native desktop notification. This keeps extensions decoupled
    // from Electron — they use the Pi SDK EventBus, the host handles
    // the platform-specific display.
    //
    // Payload: { message, type?, source?, sound?, subtitle? }

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

    // ── @ws: path expansion ────────────────────────────────────
    //
    // Expands @ws:workspace-id/relative/path references in user input
    // to absolute paths before the LLM sees them.
    //
    // Example: @ws:global/finance/portfolio.json
    //       → /Users/dan/.sero-ui/workspaces/global/finance/portfolio.json

    pi.on('input', async (event) => {
      const expanded = expandWsRefs(event.text, wsManager);
      if (expanded !== event.text) {
        return { action: 'transform' as const, text: expanded };
      }
      return { action: 'continue' as const };
    });

    // ── /workspace command ─────────────────────────────────────

    pi.registerCommand('workspace', {
      description: 'Manage workspaces: list, info, open <id>, close <id>',
      handler: async (args, ctx) => {
        const parts = (args || '').trim().split(/\s+/);
        const subcommand = parts[0] || 'info';
        const subarg = parts.slice(1).join(' ');

        switch (subcommand) {
          case 'list': {
            const all = await wsManager.list();
            const lines = all.map((w) => {
              const current = w.id === currentWorkspaceId ? ' ← current' : '';
              return `  ● ${w.name} (${w.id}) — ${w.path}${current}`;
            });
            pi.sendMessage({
              customType: 'sero-workspace',
              content: `**Workspaces:**\n${lines.join('\n')}`,
              display: true,
            });
            break;
          }

          case 'info': {
            const config = await wsManager.getConfig(currentWorkspaceId);
            if (config) {
              const lines = [
                `**Workspace:** ${config.name} (\`${currentWorkspaceId}\`)`,
                `**Path:** ${wsManager.getPath(currentWorkspaceId)}`,
                config.description ? `**Description:** ${config.description}` : '',
                config.contextHints?.length
                  ? `**Context hints:** ${config.contextHints.join(', ')}`
                  : '',
                config.tags?.length
                  ? `**Tags:** ${config.tags.join(', ')}`
                  : '',
              ].filter(Boolean);
              pi.sendMessage({
                customType: 'sero-workspace',
                content: lines.join('\n'),
                display: true,
              });
            }
            break;
          }

          case 'open': {
            if (!subarg) {
              pi.sendMessage({
                customType: 'sero-workspace',
                content: 'Usage: /workspace open <workspace-id>',
                display: true,
              });
              break;
            }
            await wsManager.open(subarg);
            pi.sendMessage({
              customType: 'sero-workspace',
              content: `Opened workspace: ${subarg}`,
              display: true,
            });
            break;
          }

          case 'close': {
            if (!subarg) {
              pi.sendMessage({
                customType: 'sero-workspace',
                content: 'Usage: /workspace close <workspace-id>',
                display: true,
              });
              break;
            }
            if (subarg === 'global') {
              pi.sendMessage({
                customType: 'sero-workspace',
                content: 'Cannot close global workspace.',
                display: true,
              });
              break;
            }
            await wsManager.close(subarg);
            pi.sendMessage({
              customType: 'sero-workspace',
              content: `Closed workspace: ${subarg}`,
              display: true,
            });
            break;
          }

          default:
            pi.sendMessage({
              customType: 'sero-workspace',
              content: `Unknown subcommand: ${subcommand}. Use: list, info, open, close`,
              display: true,
            });
        }
      },
    });

    // ── /pwd command ───────────────────────────────────────────

    pi.registerCommand('pwd', {
      description: 'Print working directory (workspace-relative)',
      handler: async (args, ctx) => {
        const wsPath = wsManager.getPath(currentWorkspaceId);
        const cwd = ctx.cwd;
        const relative = wsPath ? path.relative(wsPath, cwd) || '/' : cwd;
        pi.sendMessage({
          customType: 'sero-workspace',
          content: `**Workspace:** ${currentWorkspaceId}\n**cwd:** ${cwd}\n**Relative:** ${relative || '/'}`,
          display: true,
        });
      },
    });

    // Re-implement PI CLI built-ins for SDK mode and register Git checkpoint hooks.
    registerSeroBuiltinCommands(pi, currentWorkspaceId);
    registerGitCheckpointFeatures(pi, currentWorkspaceId);

    // ── Subagent tools (main sessions only) ──────────────────
    if (options?.enableAgentManagementTools && options.subagentManager) {
      registerSubagentTool(pi, options.subagentManager, _sessionId, currentWorkspaceId);
      registerCreateAgentTool(pi);
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Expand @ws:workspace-id/path references to absolute paths.
 *
 * Pattern: @ws:id/relative/path → /absolute/workspace/path/relative/path
 */
function expandWsRefs(text: string, wsManager: WorkspaceManager): string {
  return text.replace(/@ws:([a-z0-9-]+)(\/[^\s]*)?/g, (_match, wsId: string, relPath?: string) => {
    const wsPath = wsManager.getPath(wsId);
    if (!wsPath) return _match; // Unknown workspace — leave as-is
    if (!relPath) return wsPath;
    return path.join(wsPath, relPath);
  });
}
