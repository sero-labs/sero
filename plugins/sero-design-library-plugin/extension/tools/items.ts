import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { readIndex } from '../../shared/index-storage';
import { normalizeItemIndex } from '../../shared/indexes';
import {
  effectiveAnalysis,
  isLibrarianField,
  isOverridden,
  validateFieldValue,
  LIBRARIAN_FIELDS,
} from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import { itemRecordFile } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import { deriveFacets, selectItems } from '../../shared/search';
import { appendRequest, readJsonFile, readState } from '../../shared/state-io';
import { EMPTY_FILTERS, type ItemSummary } from '../../shared/types';
import { checkId, failure, text, type ToolResult } from './result';

/**
 * The item surface — searching, reading and editing Library items.
 *
 * Reads answer from the record directly. Every mutation appends intent for the
 * runtime to apply, because the runtime is the only authoritative writer and
 * this tool runs in a different process (spec §12).
 */

const ACTIONS = [
  'search',
  'get',
  'set-field',
  'reset-field',
  'favourite',
  'collect',
  'delete',
  'restore',
  'purge',
  'collections',
  'create-collection',
  'rename-collection',
  'delete-collection',
] as const;

/** Actions whose id becomes part of a filesystem path. */
const ITEM_ID_ACTIONS: readonly string[] = [
  'get', 'set-field', 'reset-field', 'favourite', 'collect', 'delete', 'restore', 'purge',
];
const COLLECTION_ID_ACTIONS: readonly string[] = ['collect', 'rename-collection', 'delete-collection'];

function describe(item: ItemSummary): string {
  const bits = [item.title];
  if (item.primaryStyle !== '') bits.push(item.primaryStyle);
  if (item.tags.length > 0) bits.push(item.tags.join(', '));
  if (item.analysisStatus !== 'ready') bits.push(`analysis ${item.analysisStatus}`);
  return `- ${item.id} — ${bits.join(' · ')}`;
}

async function readRecord(paths: DesignLibraryPaths, itemId: string): Promise<ItemRecord | null> {
  return readJsonFile<ItemRecord>(itemRecordFile(paths, itemId));
}

/** Full analysis with overrides applied, plus which fields are manual. */
function renderItem(record: ItemRecord): ToolResult {
  const analysis = effectiveAnalysis(record.profile);
  const overridden = LIBRARIAN_FIELDS.filter((field) => isOverridden(record.profile, field));
  const lines = [
    `${analysis.title} (${record.id})`,
    `Style: ${analysis.primaryStyle || '—'} · Types: ${analysis.designTypes.join(', ') || '—'}`,
    `Tags: ${analysis.tags.join(', ') || '—'}`,
    `Summary: ${analysis.summary || '—'}`,
    `Intent: ${analysis.designIntent || '—'}`,
    `Always: ${analysis.always.join('; ') || '—'}`,
    `Never: ${analysis.never.join('; ') || '—'}`,
    `Analysis: ${record.analysis.status}${record.analysis.error ? ` — ${record.analysis.error}` : ''}`,
    `Manual fields: ${overridden.join(', ') || 'none'}`,
    '',
    `Generation prompt:\n${analysis.generationPrompt || '—'}`,
  ];
  return text(lines.join('\n'), {
    item: {
      id: record.id,
      analysis,
      overridden,
      // Facts the item view shows alongside the analysis. None of them is an
      // editable field: they describe the file, not the Librarian's reading.
      confidence: record.profile.generated.confidence,
      analysedAt: record.profile.generated.provenance.analysedAt,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      fileName: record.source.fileName ?? '',
      width: record.asset.width ?? 0,
      height: record.asset.height ?? 0,
      bytes: record.asset.bytes,
      ...(record.generation === undefined
        ? {}
        : {
            generation: {
              capability: record.generation.capability,
              prompt: record.generation.prompt,
              model: record.generation.model,
            },
          }),
    },
  });
}

export function registerItemTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_items',
    label: 'Design Library Items',
    description:
      'Search and read visual references in the Design Library, and edit their analysis. Every user-facing analysis field can be overridden and reset independently.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which item operation to perform' }),
      itemId: Type.Optional(Type.String()),
      query: Type.Optional(Type.String({ description: 'Search titles, file names, styles, tags and Design types' })),
      limit: Type.Optional(Type.Number({ description: 'Maximum results for `search` (default 20)' })),
      field: Type.Optional(Type.String({ description: 'Analysis field name for set-field/reset-field' })),
      value: Type.Optional(Type.Unknown({ description: 'New value for set-field; must match the field type' })),
      favourite: Type.Optional(Type.Boolean()),
      collectionId: Type.Optional(Type.String()),
      member: Type.Optional(Type.Boolean({ description: 'true adds to the collection, false removes' })),
      name: Type.Optional(Type.String({ description: 'Collection name' })),
      colour: Type.Optional(Type.String({ description: 'Collection colour token (default `primary`)' })),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      // Ids build filesystem paths, so they are checked once here before any
      // action can use them.
      const needsItem = ITEM_ID_ACTIONS.includes(params.action);
      const checkedItem = needsItem ? checkId(params.itemId, 'item id') : null;
      if (checkedItem && 'error' in checkedItem) return checkedItem.error;
      const itemId = checkedItem && 'id' in checkedItem ? checkedItem.id : '';

      const needsCollection = COLLECTION_ID_ACTIONS.includes(params.action);
      const checkedCollection = needsCollection ? checkId(params.collectionId, 'collection id') : null;
      if (checkedCollection && 'error' in checkedCollection) return checkedCollection.error;
      const collectionId = checkedCollection && 'id' in checkedCollection ? checkedCollection.id : '';

      switch (params.action) {
        case 'search': {
          const items = await readIndex(paths.itemsIndexFile, normalizeItemIndex);
          const matched = selectItems(items, {
            scope: { kind: 'all' },
            query: params.query ?? '',
            filters: EMPTY_FILTERS,
            sort: 'newest',
          });
          const limited = matched.slice(0, params.limit ?? 20);
          if (limited.length === 0) return text('No references matched.', { items: [] });
          return text(
            `${matched.length} reference${matched.length === 1 ? '' : 's'} matched:\n${limited.map(describe).join('\n')}`,
            { items: limited, facets: deriveFacets(items) },
          );
        }

        case 'get': {
          const record = await readRecord(paths, itemId);
          return record ? renderItem(record) : failure(`No Library item ${itemId}.`);
        }

        case 'set-field': {
          if (!isLibrarianField(params.field)) {
            return failure(`\`set-field\` needs one of: ${LIBRARIAN_FIELDS.join(', ')}.`);
          }
          // The value is shaped by the caller, so it is validated against the
          // named field before it can reach a record.
          const checked = validateFieldValue(params.field, params.value);
          if (!checked.ok) return failure(checked.reason);
          await appendRequest(paths, {
            kind: 'item.set-field',
            itemId,
            field: params.field,
            value: checked.value,
          });
          return text(`Queued an override for \`${params.field}\`.`);
        }

        case 'reset-field': {
          if (!isLibrarianField(params.field)) {
            return failure(`\`reset-field\` needs one of: ${LIBRARIAN_FIELDS.join(', ')}.`);
          }
          await appendRequest(paths, { kind: 'item.reset-field', itemId, field: params.field });
          return text(`Queued a reset for \`${params.field}\`; the generated value will show again.`);
        }

        case 'favourite': {
          await appendRequest(paths, {
            kind: 'item.favourite',
            itemId,
            favourite: params.favourite ?? true,
          });
          return text(params.favourite === false ? 'Removed from favourites.' : 'Added to favourites.');
        }

        case 'collect': {
          await appendRequest(paths, {
            kind: 'item.collect',
            itemId,
            collectionId,
            member: params.member ?? true,
          });
          return text(params.member === false ? 'Removed from the collection.' : 'Added to the collection.');
        }

        case 'delete': {
          await appendRequest(paths, { kind: 'item.delete', itemId });
          return text('Moved to Trash. Restore it any time; nothing is removed until you purge it.');
        }

        case 'restore': {
          await appendRequest(paths, { kind: 'item.restore', itemId });
          return text('Restored.');
        }

        case 'purge': {
          await appendRequest(paths, { kind: 'item.purge', itemId });
          return text('Queued permanent deletion. Anything referencing it keeps a tombstone, not the image.');
        }

        case 'collections': {
          const state = await readState(paths);
          const items = await readIndex(paths.itemsIndexFile, normalizeItemIndex);
          if (state.collections.length === 0) return text('No collections yet.', { collections: [] });
          const counts = new Map<string, number>();
          for (const item of items) {
            if (item.deletedAt !== undefined) continue;
            for (const id of item.collectionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          const lines = state.collections.map(
            (entry) => `- ${entry.id} — ${entry.name} (${counts.get(entry.id) ?? 0})`,
          );
          return text(lines.join('\n'), { collections: state.collections });
        }

        case 'create-collection': {
          if (!params.name) return failure('`create-collection` needs a name.');
          const collectionId = randomUUID();
          await appendRequest(paths, {
            kind: 'collection.create',
            collectionId,
            name: params.name,
            colour: params.colour ?? 'primary',
          });
          return text(`Queued collection "${params.name}".`, { collectionId });
        }

        case 'rename-collection': {
          if (!params.name) return failure('`rename-collection` needs a name.');
          await appendRequest(paths, { kind: 'collection.rename', collectionId, name: params.name });
          return text('Queued the rename.');
        }

        case 'delete-collection': {
          await appendRequest(paths, { kind: 'collection.delete', collectionId });
          return text('Queued deletion of the collection. The references inside it are untouched.');
        }
      }
    },
  });
}
