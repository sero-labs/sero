/**
 * `design_library_items` and `design_library_analysis`.
 *
 * Reads resolve a Library item's editable profile (generated values with
 * explicit field overrides applied); writes are intents for the runtime.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { assertSafeId, itemRecordPath } from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';
import { resolveLibrarianField } from '../../shared/schemas';
import type { LibraryItemRecord } from '../../shared/records';
import type { LibrarianField, LibrarianUserFacingAnalysis } from '../../shared/types';
import { fail, ok, resolvePaths, submitRequest, type ToolOutput } from '../context';

const EDITABLE_FIELDS: LibrarianField[] = [
  'title',
  'notes',
  'designTypes',
  'primaryStyle',
  'tags',
  'summary',
  'designIntent',
  'aestheticVocabulary',
  'visualProfile',
  'palette',
  'always',
  'never',
  'generationPrompt',
];

function isEditableField(value: string): value is LibrarianField {
  return (EDITABLE_FIELDS as string[]).includes(value);
}

/** Generated values with every explicit override applied, field by field. */
export function resolveProfile(record: LibraryItemRecord): Partial<LibrarianUserFacingAnalysis> {
  if (!record.profile) return {};
  const resolved: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    resolved[field] = resolveLibrarianField(record.profile, field);
  }
  return resolved as Partial<LibrarianUserFacingAnalysis>;
}

const ItemParams = Type.Object({
  action: StringEnum(['get', 'update_field', 'reset_field', 'soft_delete', 'restore', 'purge'] as const),
  itemId: Type.String(),
  field: Type.Optional(Type.String({ description: 'Librarian field name' })),
  value: Type.Optional(Type.Unknown()),
});

export function createItemsTool(): ToolDefinition<typeof ItemParams> {
  return {
    name: 'design_library_items',
    label: 'Design Library items',
    description:
      'Read and edit Library items. Actions: get, update_field (field, value), reset_field (field), '
      + 'soft_delete, restore, purge. A manual edit overrides the whole field; reset removes that override.',
    parameters: ItemParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);
      assertSafeId(params.itemId, 'itemId');

      if (params.action === 'get') {
        const record = await readJsonFile<LibraryItemRecord>(itemRecordPath(paths, params.itemId));
        if (!record) return fail(`Unknown Library item ${params.itemId}.`);
        return ok(`${record.id}: ${record.analysisStatus}`, {
          item: {
            id: record.id,
            createdAt: record.createdAt,
            source: record.source,
            originalFileName: record.originalFileName,
            analysisStatus: record.analysisStatus,
            analysisError: record.analysisError,
            checksum: record.original.checksum,
            byteLength: record.original.byteLength,
            provenance: record.profile?.generated.provenance,
            confidence: record.profile?.generated.confidence,
            overriddenFields: Object.keys(record.profile?.overrides ?? {}),
            generationProvenance: record.generationProvenance,
            resolved: resolveProfile(record),
          },
        });
      }

      if (params.action === 'update_field') {
        if (!params.field || !isEditableField(params.field)) {
          return fail(`Unknown editable field ${String(params.field)}.`);
        }
        if (params.value === undefined) return fail('value is required.');
        await submitRequest(paths, 'item.update-field', {
          itemId: params.itemId,
          field: params.field,
          value: params.value,
        });
        return ok(`Override queued for ${params.field}.`);
      }

      if (params.action === 'reset_field') {
        if (!params.field || !isEditableField(params.field)) {
          return fail(`Unknown editable field ${String(params.field)}.`);
        }
        await submitRequest(paths, 'item.reset-field', { itemId: params.itemId, field: params.field });
        return ok(`Reset queued for ${params.field}.`);
      }

      const action = params.action === 'soft_delete'
        ? 'item.soft-delete'
        : params.action === 'restore'
          ? 'item.restore'
          : 'item.purge';
      await submitRequest(paths, action, { itemId: params.itemId });
      return ok(`${params.action} queued for ${params.itemId}.`);
    },
  };
}

const AnalysisParams = Type.Object({
  action: StringEnum(['analyse', 'reanalyse', 'cancel', 'retry'] as const),
  itemId: Type.String(),
});

export function createAnalysisTool(): ToolDefinition<typeof AnalysisParams> {
  return {
    name: 'design_library_analysis',
    label: 'Design Library analysis',
    description:
      'Control Librarian analysis for a Library item. Actions: analyse, reanalyse, cancel, retry. '
      + 'Reanalysis replaces generated values and preserves manual overrides.',
    parameters: AnalysisParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);
      assertSafeId(params.itemId, 'itemId');

      if (params.action === 'cancel') {
        await submitRequest(paths, 'analysis.cancel', { itemId: params.itemId });
        return ok(`Analysis cancellation queued for ${params.itemId}.`);
      }

      await submitRequest(paths, 'analysis.run', {
        itemId: params.itemId,
        reanalyse: params.action === 'reanalyse',
      });
      return ok(`Analysis queued for ${params.itemId}.`);
    },
  };
}
