/**
 * Memory Extension — persistent memory for Sero with QMD semantic search.
 *
 * Stores long-term facts (MEMORY.md), agent identity (IDENTITY.md),
 * user profile (USER.md), scratchpad (SCRATCHPAD.md), and daily logs
 * in the global workspace. All files are git-tracked via Sero's
 * existing checkpoint system.
 *
 * QMD provides keyword, semantic, and hybrid search across all files.
 * Selective injection surfaces relevant past memories before each turn.
 *
 * Tools: memory (read/write/search/list), memory_search, scratchpad
 * Hooks: before_agent_start (context injection), session lifecycle
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { checkBootstrapStatus } from './bootstrap';
import { registerContextInjection, markBootstrapDone } from './context-injector';
import { registerMemoryTool } from './memory-tool';
import { registerSearchTool } from './search-tool';
import { registerScratchpadTool } from './scratchpad';
import { registerSessionLifecycle } from './session-lifecycle';
import { initQmd, isQmdAvailable } from './qmd';

export default function memoryExtension(pi: ExtensionAPI): void {
  // ── Session start: bootstrap check + QMD init ──────────────

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

    // Init QMD (detect → auto-install → setup collection)
    const qmdReady = await initQmd();
    if (!qmdReady) {
      // Non-fatal: core memory works without QMD
      console.log('[memory] QMD not available — semantic search disabled');
    }
  });

  // ── Post-turn: detect bootstrap completion ─────────────────

  pi.on('agent_end', async () => {
    const status = await checkBootstrapStatus();
    if (!status.needsBootstrap) {
      markBootstrapDone();
    }
  });

  // ── Context injection (priority-ordered + selective search) ─

  registerContextInjection(pi);

  // ── Tools (all bridged into sero-cli via AD-020) ───────────

  registerMemoryTool(pi);
  registerSearchTool(pi);
  registerScratchpadTool(pi);

  // ── Session lifecycle (handoff + exit summary) ─────────────

  registerSessionLifecycle(pi);

  // ── Slash commands ─────────────────────────────────────────

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

  pi.registerCommand('scratchpad', {
    description: 'Show scratchpad or manage items (pass instructions inline)',
    handler: async (args) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the scratchpad tool: ${instruction}`);
      } else {
        pi.sendUserMessage('List all scratchpad items using the scratchpad tool.');
      }
    },
  });
}
