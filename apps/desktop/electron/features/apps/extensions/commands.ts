import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function registerSeroBuiltinCommands(
  pi: ExtensionAPI,
  currentWorkspaceId: string,
): void {
  // ── /reload ────────────────────────────────────────────────
  pi.registerCommand('reload', {
    description: 'Reload extensions, skills, prompts, and themes',
    handler: async (_args, ctx) => {
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
    handler: async (args) => {
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
    handler: async (_args, ctx) => {
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
        const pct = usage.percent != null ? Math.round(usage.percent * 100) : null;
        const used = usage.tokens != null ? usage.tokens.toLocaleString() : 'unknown';
        const windowSize = usage.contextWindow.toLocaleString();
        lines.push(
          `**Context:** ${used} / ${windowSize} tokens${pct != null ? ` (${pct}%)` : ''}`,
        );
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
        const current = ctx.model;
        const available = ctx.modelRegistry.getAvailable();

        const lines: string[] = [];
        if (current) {
          lines.push(`**Current:** ${current.provider}/${current.id}`);
        }
        lines.push(`**Thinking:** ${pi.getThinkingLevel()}`);
        lines.push('');
        lines.push(`**Available models** (${available.length}):`);

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

      let provider: string | undefined;
      let modelId: string;

      if (input.includes('/')) {
        const parts = input.split('/');
        provider = parts[0];
        modelId = parts.slice(1).join('/');
      } else {
        modelId = input;
      }

      let model;
      if (provider) {
        model = ctx.modelRegistry.find(provider, modelId);
      } else {
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
    handler: async (args) => {
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
}
