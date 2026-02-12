/**
 * Sero workspace extension factory.
 *
 * Injected as an inline extension factory into each AgentSession's
 * DefaultResourceLoader. Has closure access to the WorkspaceManager.
 *
 * Provides:
 *   - Composite environment context injection (before_agent_start)
 *   - @ws:id/path expansion in user input (input event)
 *   - /workspace command (list, info, open, close)
 *   - /pwd command (print workspace-relative cwd)
 */

import path from 'path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { WorkspaceManager } from './workspace';
import type { WorkspaceInfo } from '../src/types/ipc';

/**
 * Creates an extension factory for a specific workspace session.
 *
 * @param wsManager - The workspace manager (has composite state)
 * @param currentWorkspaceId - The workspace this session belongs to
 */
export function createSeroExtensionFactory(
  wsManager: WorkspaceManager,
  currentWorkspaceId: string,
) {
  return (pi: ExtensionAPI) => {
    // ── Composite prompt injection ─────────────────────────────
    //
    // Before each agent turn, inject summaries of other open workspaces
    // into the system prompt so the AI has cross-workspace awareness.

    pi.on('before_agent_start', async (event) => {
      const compositeBlock = await buildCompositeBlock(wsManager, currentWorkspaceId);
      if (!compositeBlock) return;

      return {
        systemPrompt: event.systemPrompt + compositeBlock,
      };
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
            const openIds = new Set(wsManager.getOpenIds());
            const lines = all.map((w) => {
              const open = openIds.has(w.id) ? '●' : '○';
              const current = w.id === currentWorkspaceId ? ' ← current' : '';
              return `  ${open} ${w.name} (${w.id}) — ${w.path}${current}`;
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
            wsManager.openInComposite(subarg);
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
            if (subarg === 'scratchpad') {
              pi.sendMessage({
                customType: 'sero-workspace',
                content: 'Cannot close scratchpad workspace.',
                display: true,
              });
              break;
            }
            wsManager.closeInComposite(subarg);
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
  };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Build the composite environment block for the system prompt.
 * Returns null if there are no other open workspaces to mention.
 */
async function buildCompositeBlock(
  wsManager: WorkspaceManager,
  activeWorkspaceId: string,
): Promise<string | null> {
  const openWorkspaces = await wsManager.getOpenWorkspaces();
  const others = openWorkspaces.filter((ws) => ws.id !== activeWorkspaceId);

  if (others.length === 0) return null;

  const entries = others.map((ws) => {
    let entry = `- **${ws.name}** (\`${ws.id}\`): ${ws.description || ws.path}`;
    entry += `\n  Path: \`${ws.path}\``;
    if (ws.contextHints?.length) {
      entry += `\n  Context: ${ws.contextHints.join('; ')}`;
    }
    return entry;
  });

  return (
    '\n\n## Open Workspaces (Composite Environment)\n\n' +
    'The following workspaces are also open in the user\'s environment. ' +
    'You have awareness of their content and purpose. To read files from ' +
    'another workspace, use their absolute path. The user may reference ' +
    'them with @ws:workspace-id/path syntax.\n\n' +
    entries.join('\n\n')
  );
}

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
