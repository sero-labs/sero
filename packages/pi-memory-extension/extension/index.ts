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
import { registerContextInjection, markBootstrapDone } from './context-injector';
import { registerMemoryTool } from './memory-tool';

export default function memoryExtension(pi: ExtensionAPI): void {
  // Warm the bootstrap cache on session start and notify on first run
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

  // After each agent turn, if bootstrap was in progress and
  // memory files are now written, update the cache so subsequent
  // turns switch to normal context injection.
  pi.on('agent_end', async () => {
    // Re-check; if MEMORY.md now exists, mark bootstrap done
    const status = await checkBootstrapStatus();
    if (!status.needsBootstrap) {
      markBootstrapDone();
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
