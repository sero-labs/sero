import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

import {
  describeAutoConsolidationCadence,
  syncAutoConsolidationCronJobSync,
  type AutoConsolidationCadence,
} from './automation-state';
import {
  describeMemorySnapshotMode,
  getMemorySnapshotModeSync,
  setMemorySnapshotModeSync,
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
): ToolTextResult {
  if (snapshot) {
    const nextMode = setMemorySnapshotModeSync(snapshot);
    return text([
      `Memory snapshot mode set to ${nextMode}.`,
      describeMemorySnapshotMode(nextMode),
      nextMode === 'frozen'
        ? 'Mid-session writes to IDENTITY.md, USER.md, and MEMORY.md will appear in the next session.'
        : 'Memory context will be rebuilt on every turn.',
    ].join('\n'));
  }

  const currentMode = getMemorySnapshotModeSync();
  return text([
    `Memory snapshot mode: ${currentMode}.`,
    describeMemorySnapshotMode(currentMode),
  ].join('\n'));
}
