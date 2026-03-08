/**
 * Memory Extension — persistent memory for Sero.
 *
 * Stores long-term facts (MEMORY.md), agent identity (IDENTITY.md),
 * user profile (USER.md), and daily logs in the global workspace.
 * All files are git-tracked via Sero's existing checkpoint system.
 *
 * On first run, the agent uses the `questionnaire` tool to ask the
 * user setup questions, then writes answers to memory files.
 *
 * Tools (LLM-callable): memory (read, write, search, list)
 * Hooks: before_agent_start (context injection + bootstrap)
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { checkBootstrapStatus } from './bootstrap';
import { registerContextInjection } from './context-injector';
import { registerMemoryTool } from './memory-tool';

export default function memoryExtension(pi: ExtensionAPI): void {
  // Notify the user on first run (directories are created, but files
  // are written by the agent after collecting questionnaire answers)
  pi.on('session_start', async () => {
    const status = await checkBootstrapStatus();
    if (status.needsBootstrap) {
      pi.sendMessage(
        {
          customType: 'memory-bootstrap',
          content: 'Memory system detected — starting setup.',
          display: true,
        },
        { triggerTurn: false },
      );
    }
  });

  // Inject memory context (or bootstrap instructions) into the system prompt
  registerContextInjection(pi);

  // Register the memory tool (bridged into sero-cli via AD-020)
  registerMemoryTool(pi);

  // /memory slash command for the user
  pi.registerCommand('memory', {
    description: 'Show memory files or manage them (pass instructions inline)',
    handler: async (args) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the memory tool: ${instruction}`);
      } else {
        pi.sendUserMessage('List all memory files using the memory tool.');
      }
    },
  });
}
