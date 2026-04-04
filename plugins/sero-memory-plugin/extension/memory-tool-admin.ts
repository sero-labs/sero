import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

import {
  describeAutoConsolidationCadence,
  syncAutoConsolidationCronJobSync,
  type AutoConsolidationCadence,
} from './automation-state';
import {
  describeAutoRetrieveMode,
  describeMemorySnapshotMode,
  getAutoRetrieveModeSync,
  getMemorySnapshotModeSync,
  setAutoRetrieveModeSync,
  setMemorySnapshotModeSync,
  type AutoRetrieveMode,
  type MemorySnapshotMode,
} from './memory-config';
import {
  runMemoryConsolidationSafely,
  type ConsolidationTrigger,
} from './consolidation';

interface ToolTextResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, never>;
}

function text(t: string): ToolTextResult {
  return { content: [{ type: 'text', text: t }], details: {} };
}

export async function handleMemoryConsolidate(
  schedule: AutoConsolidationCadence | undefined,
  trigger: ConsolidationTrigger | undefined,
  ctx: ExtensionContext,
): Promise<ToolTextResult> {
  if (schedule) {
    const sync = syncAutoConsolidationCronJobSync(schedule);
    const cadenceLabel = describeAutoConsolidationCadence(sync.cadence);
    if (sync.cadence === 'off') {
      if (ctx.hasUI) {
        ctx.ui.notify('Automatic memory consolidation disabled', 'info');
      }
      return text('Automatic memory consolidation disabled.');
    }

    const message = [
      `Automatic memory consolidation set to ${cadenceLabel}.`,
      'Sero will keep older daily logs distilled into MEMORY.md automatically.',
      'Change it any time with `sero memory consolidate --schedule daily|weekly|off`.',
    ].join('\n');

    if (ctx.hasUI) {
      ctx.ui.notify(`Automatic memory consolidation set to ${sync.cadence}`, 'info');
    }
    return text(message);
  }

  const summary = await runMemoryConsolidationSafely(ctx, trigger ?? 'manual');
  if (ctx.hasUI && summary.changed) {
    ctx.ui.notify(
      summary.addedEntries > 0
        ? `Memory consolidation added ${summary.addedEntries} entries`
        : 'Memory consolidation finished',
      'info',
    );
  }
  return text(summary.message);
}

export function handleMemoryConfig(
  snapshot: MemorySnapshotMode | undefined,
  autoRetrieve: AutoRetrieveMode | undefined,
): ToolTextResult {
  const lines: string[] = [];

  if (snapshot) {
    const nextMode = setMemorySnapshotModeSync(snapshot);
    lines.push(
      `Memory snapshot mode set to ${nextMode}.`,
      describeMemorySnapshotMode(nextMode),
      nextMode === 'frozen'
        ? 'Mid-session writes to IDENTITY.md, USER.md, and MEMORY.md will appear in the next session.'
        : 'Memory context will be rebuilt on every turn.',
    );
  }

  if (autoRetrieve) {
    const nextMode = setAutoRetrieveModeSync(autoRetrieve);
    if (lines.length > 0) lines.push('');
    lines.push(
      `Auto-retrieve set to ${nextMode}.`,
      describeAutoRetrieveMode(nextMode),
    );
  }

  // No arguments — show current config
  if (!snapshot && !autoRetrieve) {
    const currentSnapshot = getMemorySnapshotModeSync();
    const currentAutoRetrieve = getAutoRetrieveModeSync();
    lines.push(
      `Memory snapshot mode: ${currentSnapshot} — ${describeMemorySnapshotMode(currentSnapshot)}`,
      `Auto-retrieve: ${currentAutoRetrieve} — ${describeAutoRetrieveMode(currentAutoRetrieve)}`,
    );
  }

  return text(lines.join('\n'));
}
