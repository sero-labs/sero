/**
 * CLI commands for the research orchestrator (/research, /analyze).
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export function registerCommands(pi: ExtensionAPI): void {
  // ── Command: /research ─────────────────────────────────────

  pi.registerCommand('research', {
    description: 'Start a multi-agent research session on any topic',
    handler: async (args, _ctx) => {
      const question = args.trim();
      if (question) {
        pi.sendUserMessage(
          `I want to research: "${question}"\n\n` +
          `Please decompose this into 2-4 non-overlapping research workstreams. ` +
          `For each workstream, identify the key sections to cover. ` +
          `Then use the research tool with action "plan" to create the research plan, ` +
          `providing the question and an agents array with name and sections for each workstream.`,
        );
      } else {
        pi.sendUserMessage(
          'I want to start a research session. Use the question tool to ask me what topic ' +
          'I want to research (do NOT use the interview or questionnaire tool). ' +
          'Once I provide a topic, decompose it into 2-4 non-overlapping workstreams ' +
          'using the research tool.',
        );
      }
    },
  });

  // ── Command: /analyze ─────────────────────────────────────

  pi.registerCommand('analyze', {
    description: 'Analyse article URLs for commercial opportunities and actionable insights',
    handler: async (args, _ctx) => {
      const input = args.trim();
      if (input) {
        // Extract URLs from the input
        const urlPattern = /https?:\/\/[^\s,]+/g;
        const urls = input.match(urlPattern) ?? [];
        // Everything that isn't a URL is treated as context
        const context = input.replace(urlPattern, '').replace(/[,\s]+/g, ' ').trim();

        if (urls.length > 0) {
          pi.sendUserMessage(
            `Analyse these articles for commercial opportunities and actionable insights.\n\n` +
            `Use the research tool with action "analyze", passing:\n` +
            `- urls: ${JSON.stringify(urls)}\n` +
            (context ? `- context: "${context}"\n` : '') +
            `\nThis will create a structured analysis plan. After I approve, launch the agents.`,
          );
        } else {
          pi.sendUserMessage(
            `I want to analyse an article. Use the question tool to ask me for the URL(s) and ` +
            `any context about what I'm building or looking for. Then use the research tool ` +
            `with action "analyze".`,
          );
        }
      } else {
        pi.sendUserMessage(
          `I want to analyse an article for commercial opportunities. Use the question tool ` +
          `to ask me for the URL(s) and any context about what I'm building or looking for ` +
          `(do NOT use the interview or questionnaire tool). ` +
          `Then use the research tool with action "analyze".`,
        );
      }
    },
  });
}
