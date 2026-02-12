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
 *   - PI CLI built-in equivalents: /reload, /compact, /name, /session, /model, /thinking
 */

import path from 'path';
import { Type } from '@sinclair/typebox';
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
    // ── Session title generation ───────────────────────────────
    //
    // On the first turn, inject a system prompt instruction telling
    // the agent to call set_session_title with a short title.
    // The tool sets the session name via pi.setSessionName().

    let titleSet = false;

    pi.registerTool({
      name: 'set_session_title',
      label: 'Set Session Title',
      description: 'Set a short title for the current chat session. Call this once after your first response.',
      parameters: Type.Object({
        title: Type.String({ description: 'Concise title, 3-6 words' }),
      }),
      execute: async (_toolCallId, params) => {
        const title = params.title?.trim();
        
        if (title) {
          pi.setSessionName(title);
          titleSet = true;
        }
        return {
          content: [{ type: 'text', text: title ? `Session titled: ${title}` : 'No title provided' }],
          details: {},
        };
      },
    });

    // ── Composite prompt injection ─────────────────────────────
    //
    // Before each agent turn, inject summaries of other open workspaces
    // into the system prompt so the AI has cross-workspace awareness.
    // On the first turn, also ask the agent to generate a session title.

    pi.on('before_agent_start', async (event) => {
      let systemPrompt = event.systemPrompt;

      const compositeBlock = await buildCompositeBlock(wsManager, currentWorkspaceId);
      if (compositeBlock) {
        systemPrompt += compositeBlock;
      }

      if (systemPrompt !== event.systemPrompt) {
        return { systemPrompt };
      }
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

    // ── PI CLI built-in equivalents ────────────────────────────
    //
    // These are handled by PI's interactive TUI mode and aren't
    // available via the SDK's prompt(). We re-implement them as
    // extension commands so they work in Sero.

    // ── /reload ────────────────────────────────────────────────

    pi.registerCommand('reload', {
      description: 'Reload extensions, skills, prompts, and themes',
      handler: async (args, ctx) => {
        await ctx.reload();
        pi.sendMessage({
          customType: 'sero-info',
          content: 'Reloaded extensions, skills, prompts, and themes.',
          display: true,
        });
      },
    });

    // ── /compact [instructions] ────────────────────────────────

    pi.registerCommand('compact', {
      description: 'Compact conversation context',
      handler: async (args, ctx) => {
        const instructions = args?.trim() || undefined;
        ctx.compact({
          customInstructions: instructions,
          onComplete: () => {
            pi.sendMessage({
              customType: 'sero-info',
              content: 'Context compacted successfully.',
              display: true,
            });
          },
          onError: (error) => {
            pi.sendMessage({
              customType: 'sero-info',
              content: `Compaction failed: ${error.message}`,
              display: true,
            });
          },
        });
        pi.sendMessage({
          customType: 'sero-info',
          content: instructions
            ? `Compacting context with instructions: ${instructions}`
            : 'Compacting context…',
          display: true,
        });
      },
    });

    // ── /name [name] ───────────────────────────────────────────

    pi.registerCommand('name', {
      description: 'Set or show session display name',
      handler: async (args, ctx) => {
        const name = args?.trim();
        if (name) {
          pi.setSessionName(name);
          pi.sendMessage({
            customType: 'sero-info',
            content: `Session name set to: **${name}**`,
            display: true,
          });
        } else {
          const current = pi.getSessionName();
          pi.sendMessage({
            customType: 'sero-info',
            content: current
              ? `Session name: **${current}**`
              : 'No session name set. Usage: `/name <name>`',
            display: true,
          });
        }
      },
    });

    // ── /session ───────────────────────────────────────────────

    pi.registerCommand('session', {
      description: 'Show session info (path, tokens, cost)',
      handler: async (args, ctx) => {
        const sm = ctx.sessionManager;
        const usage = ctx.getContextUsage();
        const model = ctx.model;

        const lines: string[] = [];
        lines.push(`**Session:** ${pi.getSessionName() || '(unnamed)'}`);
        lines.push(`**Workspace:** ${currentWorkspaceId}`);

        const sessionFile = sm.getSessionFile?.();
        if (sessionFile) {
          lines.push(`**File:** \`${sessionFile}\``);
        }

        if (model) {
          lines.push(`**Model:** ${model.provider}/${model.id}`);
        }

        lines.push(`**Thinking:** ${pi.getThinkingLevel()}`);

        if (usage) {
          const pct = Math.round(usage.percent * 100);
          lines.push(`**Context:** ${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens (${pct}%)`);
        }

        const entries = sm.getEntries();
        lines.push(`**Messages:** ${entries.length}`);

        pi.sendMessage({
          customType: 'sero-info',
          content: lines.join('\n'),
          display: true,
        });
      },
    });

    // ── /model [provider/id] ───────────────────────────────────

    pi.registerCommand('model', {
      description: 'Switch model or show current',
      handler: async (args, ctx) => {
        const input = args?.trim();

        if (!input) {
          // Show current model + available models
          const current = ctx.model;
          const available = ctx.modelRegistry.getAvailable();

          const lines: string[] = [];
          if (current) {
            lines.push(`**Current:** ${current.provider}/${current.id}`);
          }
          lines.push(`**Thinking:** ${pi.getThinkingLevel()}`);
          lines.push('');
          lines.push(`**Available models** (${available.length}):`);

          // Group by provider
          const byProvider = new Map<string, string[]>();
          for (const m of available) {
            const list = byProvider.get(m.provider) || [];
            list.push(m.id);
            byProvider.set(m.provider, list);
          }
          for (const [provider, ids] of byProvider) {
            lines.push(`  **${provider}:** ${ids.join(', ')}`);
          }

          lines.push('');
          lines.push('Usage: `/model <provider>/<id>` or `/model <id>`');

          pi.sendMessage({
            customType: 'sero-info',
            content: lines.join('\n'),
            display: true,
          });
          return;
        }

        // Parse provider/id or just id
        let provider: string | undefined;
        let modelId: string;

        if (input.includes('/')) {
          const parts = input.split('/');
          provider = parts[0];
          modelId = parts.slice(1).join('/');
        } else {
          modelId = input;
        }

        // Find the model
        let model;
        if (provider) {
          model = ctx.modelRegistry.find(provider, modelId);
        } else {
          // Search all providers for this model ID
          const available = ctx.modelRegistry.getAvailable();
          model = available.find((m) => m.id === modelId);
        }

        if (!model) {
          pi.sendMessage({
            customType: 'sero-info',
            content: `Model not found: **${input}**\n\nUse \`/model\` to see available models.`,
            display: true,
          });
          return;
        }

        const success = await pi.setModel(model);
        if (success) {
          pi.sendMessage({
            customType: 'sero-info',
            content: `Switched to **${model.provider}/${model.id}**`,
            display: true,
          });
        } else {
          pi.sendMessage({
            customType: 'sero-info',
            content: `No API key available for **${model.provider}/${model.id}**`,
            display: true,
          });
        }
      },
    });

    // ── /thinking [level] ──────────────────────────────────────

    pi.registerCommand('thinking', {
      description: 'Set thinking level (off, minimal, low, medium, high, xhigh)',
      handler: async (args, ctx) => {
        const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
        type Level = typeof LEVELS[number];

        const input = args?.trim()?.toLowerCase();

        if (!input) {
          const current = pi.getThinkingLevel();
          pi.sendMessage({
            customType: 'sero-info',
            content: `**Thinking:** ${current}\n\nUsage: \`/thinking <level>\`\nLevels: ${LEVELS.join(', ')}`,
            display: true,
          });
          return;
        }

        if (!LEVELS.includes(input as Level)) {
          pi.sendMessage({
            customType: 'sero-info',
            content: `Invalid thinking level: **${input}**\n\nValid levels: ${LEVELS.join(', ')}`,
            display: true,
          });
          return;
        }

        pi.setThinkingLevel(input as Level);
        pi.sendMessage({
          customType: 'sero-info',
          content: `Thinking level set to **${input}**`,
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
