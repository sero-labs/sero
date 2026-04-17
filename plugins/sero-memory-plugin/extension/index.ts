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

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

import { checkBootstrapStatus } from './bootstrap';
import { registerContextInjection, markBootstrapDone } from './context-injector';
import {
  clearPhase1MigrationState,
  setPhase1MigrationState,
} from './phase1-migration-state';
import { registerMemoryTool } from './memory-tool';
import { registerSearchTool } from './search-tool';
import { registerScratchpadTool } from './scratchpad';
import { registerSessionLifecycle } from './session-lifecycle';
import { registerActivityObserver } from './activity-observer';
import { initQmd, runQmdUpdateNow } from './qmd';
import { runPhase1Migration } from './migration';
import { hasPendingStaleLogs, runMemoryConsolidationSafely } from './consolidation';
import { error, errorDetails, getMemoryLogDirPath, getMemoryLogPath, info } from './logger';
import {
  describeAutoConsolidationCadence,
  getAutoConsolidationCommand,
  getAutoConsolidationCadenceSync,
  markAutoConsolidationIntroShownSync,
  shouldShowAutoConsolidationIntroSync,
  syncAutoConsolidationCronJobSync,
} from './automation-state';
import {
  getTranscriptExportDir,
  markTranscriptRecallIntroShown,
  shouldShowTranscriptRecallIntro,
} from './transparency-state';
import { startBackfillInBackground } from './session-transcripts';

export default function memoryExtension(pi: ExtensionAPI): void {
  info('extension_loaded', { logPath: getMemoryLogPath() });

  let awaitingBootstrapFollowUp = false;

  try {
    const autoConsolidation = syncAutoConsolidationCronJobSync();
    info('auto_consolidation_sync', { ...autoConsolidation });
  } catch (err) {
    error('auto_consolidation_sync_failed', errorDetails(err));
  }

  // ── Session start: bootstrap check + QMD init ──────────────

  async function handleSessionEnter(source: 'session_start' | 'session_switch', ctx: ExtensionContext): Promise<void> {
    const sessionId = ctx.sessionManager.getSessionId();
    clearPhase1MigrationState(sessionId);

    info('session_enter', {
      source,
      sessionFile: ctx.sessionManager.getSessionFile?.() ?? null,
      cwd: ctx.cwd,
      sessionId,
    });

    const status = await checkBootstrapStatus();
    info('bootstrap_status', {
      source,
      needsBootstrap: status.needsBootstrap,
      hasExistingUserContent: Boolean(status.existingUserContent),
    });

    awaitingBootstrapFollowUp = status.needsBootstrap;

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

    let migrationChanged = false;
    if (!status.needsBootstrap) {
      const migration = await runPhase1Migration(ctx);
      migrationChanged = migration.changed;
      setPhase1MigrationState(sessionId, migration.changed);
      info('migration_result', {
        source,
        changed: migration.changed,
        notes: migration.notes,
      });
    }

    // Init QMD (detect → auto-install → setup collection)
    const qmdReady = await initQmd();
    info('qmd_init', { source, ready: qmdReady });
    if (!qmdReady) {
      // Non-fatal: core memory works without QMD
      console.log('[memory] QMD not available — semantic search disabled');
    } else if (migrationChanged) {
      await runQmdUpdateNow();
      info('qmd_update_triggered', { source, reason: 'migration_changed' });
    }

    // Start session transcript backfill in background (non-blocking)
    if (qmdReady && !status.needsBootstrap) {
      startBackfillInBackground();
    }

    // §3.1 session-start trigger: lightweight non-blocking consolidation
    // Fires concurrently — does NOT block the first turn.
    const cadence = getAutoConsolidationCadenceSync();
    if (!status.needsBootstrap && cadence !== 'off') {
      hasPendingStaleLogs(7).then(async (hasStale) => {
        if (!hasStale) {
          info('session_consolidation_skipped', { source, reason: 'no_stale_logs' });
          return;
        }
        info('session_consolidation_triggered', { source });
        try {
          const result = await runMemoryConsolidationSafely(ctx, 'auto');
          info('session_consolidation_complete', {
            source,
            changed: result.changed,
            addedEntries: result.addedEntries,
            processedLogs: result.processedLogs,
          });
        } catch (err) {
          // Non-fatal — cron and manual triggers remain as fallbacks
          error('session_consolidation_failed', { source, ...errorDetails(err) });
        }
      }).catch((err) => {
        error('session_consolidation_check_failed', { source, ...errorDetails(err) });
      });
    }

    if (qmdReady && !status.needsBootstrap && await shouldShowTranscriptRecallIntro()) {
      const transcriptDir = getTranscriptExportDir();
      pi.sendMessage(
        {
          customType: 'memory-info',
          content: [
            'Conversation recall is enabled.',
            '',
            'Sero will keep searchable session transcripts up to date automatically.',
            `Transcript exports live in \`${transcriptDir}\`.`,
            'You usually do not need to manage these files yourself.',
          ].join('\n'),
          display: true,
        },
        { triggerTurn: false },
      );
      ctx.ui?.notify?.('Conversation recall enabled', 'info');
      await markTranscriptRecallIntroShown();
      info('transcript_recall_intro_shown', { source, transcriptDir });
    }

    if (!status.needsBootstrap && cadence !== 'off' && shouldShowAutoConsolidationIntroSync()) {
      const cadenceLabel = describeAutoConsolidationCadence(cadence);
      const command = getAutoConsolidationCommand();
      pi.sendMessage(
        {
          customType: 'memory-info',
          content: [
            'Automatic memory consolidation is enabled.',
            '',
            `Current cadence: ${cadenceLabel}.`,
            'Older daily logs will be distilled into `MEMORY.md` automatically.',
            `The scheduled job runs \`${command}\` in the background.`,
            'Change it with `sero memory consolidate --schedule daily|weekly|off`.',
          ].join('\n'),
          display: true,
        },
        { triggerTurn: false },
      );
      ctx.ui?.notify?.(`Automatic memory consolidation enabled (${cadence})`, 'info');
      markAutoConsolidationIntroShownSync();
      info('auto_consolidation_intro_shown', { source, cadence });
    }
  }

  pi.on('session_start', async (_event, ctx) => {
    try {
      await handleSessionEnter('session_start', ctx);
    } catch (err) {
      error('session_enter_failed', { source: 'session_start', ...errorDetails(err) });
      throw err;
    }
  });

  pi.on('session_switch', async (_event, ctx) => {
    try {
      await handleSessionEnter('session_switch', ctx);
    } catch (err) {
      error('session_enter_failed', { source: 'session_switch', ...errorDetails(err) });
      throw err;
    }
  });

  // ── Post-turn: detect bootstrap completion ─────────────────

  pi.on('agent_end', async () => {
    const status = await checkBootstrapStatus();
    info('agent_end', {
      needsBootstrap: status.needsBootstrap,
      awaitingBootstrapFollowUp,
    });

    if (!status.needsBootstrap) {
      markBootstrapDone();

      if (awaitingBootstrapFollowUp) {
        awaitingBootstrapFollowUp = false;
        pi.sendMessage(
          {
            customType: '',
            content: 'Memory is all set — what would you like to work on?',
            display: true,
          },
          { triggerTurn: false },
        );
        info('bootstrap_follow_up_sent', {});
      }
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

  // ── Activity observer (auto-log significant work) ──────────

  registerActivityObserver(pi);

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

  pi.registerCommand('memory-log', {
    description: 'Show the memory plugin debug log path',
    handler: async () => {
      pi.sendMessage(
        {
          customType: 'memory-debug-log',
          content: `Memory debug logs: \`${getMemoryLogDirPath()}\` (today: \`${getMemoryLogPath()}\`)`,
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });
}
