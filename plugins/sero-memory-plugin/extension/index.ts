/**
 * Memory Extension — persistent memory for Sero.
 *
 * Stores long-term facts (MEMORY.md), agent identity (IDENTITY.md) and the
 * user profile (USER.md) in the global workspace, and adds them to the
 * system prompt of every session.
 *
 * Tools: memory (read/write/replace/remove)
 * Hooks: before_agent_start (context injection)
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerContextInjection } from './context-injector';
import { removeLegacyConsolidationJob } from './legacy-cleanup';
import { registerMemoryTool } from './memory-tool';

export default function memoryExtension(pi: ExtensionAPI): void {
  removeLegacyConsolidationJob().catch((error: unknown) => {
    console.error('[memory] could not remove the old consolidation job', error);
  });

  registerContextInjection(pi);

  // Bridged into sero-cli via AD-020.
  registerMemoryTool(pi);

  pi.registerCommand('memory', {
    description: 'Show memory files or manage them (pass instructions inline)',
    handler: async (args) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the memory tool: ${instruction}`);
      } else {
        pi.sendUserMessage('Read my identity, user, and memory files using the memory tool.');
      }
    },
  });
}
