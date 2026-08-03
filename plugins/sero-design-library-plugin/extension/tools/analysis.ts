import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { readIndex } from '../../shared/index-storage';
import { normalizeItemIndex, normalizeJobIndex } from '../../shared/indexes';
import type { DesignLibraryPaths } from '../../shared/paths';
import { appendRequest } from '../../shared/state-io';
import { checkId, failure, text, type ToolResult } from './result';

/**
 * The analysis surface — asking the Librarian to look, or to look again.
 *
 * Analysis starts automatically on import, so this exists for the cases the
 * automatic path does not cover: a run that failed, a reference whose analysis
 * is stale after a manual edit, or one the user cancelled.
 */

const ACTIONS = ['status', 'analyse', 'reanalyse', 'cancel', 'retry'] as const;

export function registerAnalysisTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_analysis',
    label: 'Design Library Analysis',
    description:
      'Check or control Librarian analysis for Design Library references. Analysis runs automatically on import; use this to reanalyse, cancel or retry.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which analysis operation to perform' }),
      itemId: Type.Optional(Type.String({ description: 'Required by every action except `status`' })),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      if (params.action === 'status') {
        const [items, jobs] = await Promise.all([
          readIndex(paths.itemsIndexFile, normalizeItemIndex),
          readIndex(paths.jobsIndexFile, normalizeJobIndex),
        ]);
        const live = items.filter((item) => item.deletedAt === undefined);
        const counts = live.reduce<Record<string, number>>((totals, item) => {
          totals[item.analysisStatus] = (totals[item.analysisStatus] ?? 0) + 1;
          return totals;
        }, {});
        const summary = Object.entries(counts)
          .map(([status, count]) => `${count} ${status}`)
          .join(', ');
        return text(
          live.length === 0 ? 'The Library is empty.' : `${live.length} references: ${summary}.`,
          { counts, jobs },
        );
      }

      const checked = checkId(params.itemId, 'item id');
      if ('error' in checked) return checked.error;
      const itemId = checked.id;

      switch (params.action) {
        case 'analyse':
          await appendRequest(paths, { kind: 'analysis.run', itemId, force: false });
          return text('Queued analysis.');

        case 'reanalyse':
          // Reanalysis replaces the generated profile only — manual edits stay.
          await appendRequest(paths, { kind: 'analysis.run', itemId, force: true });
          return text('Queued reanalysis. Fields you edited by hand are kept.');

        case 'retry':
          await appendRequest(paths, { kind: 'analysis.run', itemId, force: true });
          return text('Queued a retry.');

        case 'cancel':
          await appendRequest(paths, { kind: 'analysis.cancel', itemId });
          return text('Queued a cancellation.');
      }
    },
  });
}
