import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { DesignBrief, DesignRecord } from '../../shared/design';
import { MAX_REFERENCES, MAX_VARIANTS, MIN_VARIANTS, plannedVariantCount } from '../../shared/design';
import { normalizeDesignBrief, normalizeDesignRecord } from '../../shared/design-normalize';
import { effectiveAnalysis } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designRecordFile, itemRecordFile } from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import { normalizeItemRecord } from '../../shared/records';
import { appendRequest, readJsonFile, readState } from '../../shared/state-io';
import type { ConflictResolution } from '../../shared/synthesis';
import { applyResolutions, synthesizeGuardrails } from '../../shared/synthesis';
import { checkId, failure, text, type ToolResult } from './result';

/**
 * The Design surface — reading Designs and starting work on them.
 *
 * `create` is checked here as well as in the runtime, and on purpose. The tool
 * call is the only place that can tell the caller *why* a Design was refused;
 * the runtime checks again because the request log is a file and this process is
 * not the only thing that can write it.
 */

const ACTIONS = [
  'list',
  'get',
  'synthesis',
  'create',
  'open',
  'rename',
  'retry-variant',
  'cancel-variant',
  'delete',
  'restore',
] as const;

const DESIGN_ID_ACTIONS: readonly string[] = [
  'get', 'open', 'rename', 'retry-variant', 'cancel-variant', 'delete', 'restore',
];
const VARIANT_ID_ACTIONS: readonly string[] = ['retry-variant', 'cancel-variant'];

async function readReferences(
  paths: DesignLibraryPaths,
  itemIds: string[],
): Promise<{ items: ItemRecord[] } | { error: ToolResult }> {
  const unique = [...new Set(itemIds)];
  if (unique.length === 0) return { error: failure('`create` needs at least one referenceItemId.') };
  if (unique.length > MAX_REFERENCES) {
    return { error: failure(`A Design takes at most ${MAX_REFERENCES} references.`) };
  }
  for (const itemId of unique) {
    const checked = checkId(itemId, 'item id');
    if ('error' in checked) return { error: checked.error };
  }

  const records = await Promise.all(
    unique.map(async (itemId) =>
      normalizeItemRecord(await readJsonFile<unknown>(itemRecordFile(paths, itemId))),
    ),
  );
  const missing = unique.filter((_, index) => records[index] === null);
  if (missing.length > 0) return { error: failure(`No Library item ${missing.join(', ')}.`) };
  return { items: records.filter((record): record is ItemRecord => record !== null) };
}

function guardrailsOf(items: ItemRecord[]) {
  return items.map((item, order) => {
    const analysis = effectiveAnalysis(item.profile);
    return { itemId: item.id, order, always: analysis.always, never: analysis.never };
  });
}

function briefFrom(params: {
  request?: string;
  recipeId?: string;
  target?: 'html' | 'react';
  variationMode?: 'blend' | 'per-reference';
  variantCount?: number;
  inspirationStrength?: 'light' | 'balanced' | 'strong';
}): DesignBrief {
  return normalizeDesignBrief({
    request: params.request ?? '',
    ...(params.recipeId === undefined ? {} : { recipeId: params.recipeId }),
    target: params.target,
    variationMode: params.variationMode,
    variantCount: params.variantCount,
    inspirationStrength: params.inspirationStrength,
  });
}

function describeVariant(design: DesignRecord, index: number): string {
  const variant = design.variants[index];
  if (!variant) return '';
  const detail = variant.error === undefined ? '' : ` — ${variant.error}`;
  const revisions = variant.revisions.length === 0 ? '' : ` · ${variant.revisions.length} revision(s)`;
  return `- ${String(index + 1).padStart(2, '0')} ${variant.id} · ${variant.status}${revisions}${detail}`;
}

function renderDesign(design: DesignRecord): ToolResult {
  const lines = [
    `${design.title} (${design.id})`,
    `Target: ${design.brief.target} · Mode: ${design.brief.variationMode} · Influence: ${design.brief.inspirationStrength}`,
    `Request: ${design.brief.request}`,
    `References: ${design.references.map((reference) => reference.itemId).join(', ')}`,
    `Always: ${design.appliedGuardrails.always.join('; ') || '—'}`,
    `Never: ${design.appliedGuardrails.never.join('; ') || '—'}`,
    'Variants:',
    ...design.variants.map((_, index) => describeVariant(design, index)),
  ];
  return text(lines.join('\n'), { design });
}

export function registerDesignTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_designs',
    label: 'Design Library Designs',
    description:
      'Read Design Library designs and start new ones from named references. Reference order matters — the first is primary and leads the visual direction. Use `synthesis` first to see the combined guardrails and any conflict that must be resolved before `create` will run.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which design operation to perform' }),
      designId: Type.Optional(Type.String()),
      variantId: Type.Optional(Type.String()),
      referenceItemIds: Type.Optional(
        Type.Array(Type.String(), {
          description: `Ordered Library item ids, 1–${MAX_REFERENCES}; the first is primary`,
        }),
      ),
      request: Type.Optional(Type.String({ description: 'What the Design should create' })),
      title: Type.Optional(Type.String()),
      recipeId: Type.Optional(Type.String({ description: 'Prompt recipe id from settings' })),
      target: Type.Optional(StringEnum(['html', 'react'] as const)),
      variationMode: Type.Optional(StringEnum(['blend', 'per-reference'] as const)),
      variantCount: Type.Optional(
        Type.Number({ description: `${MIN_VARIANTS}–${MAX_VARIANTS}; ignored for per-reference` }),
      ),
      inspirationStrength: Type.Optional(StringEnum(['light', 'balanced', 'strong'] as const)),
      resolutions: Type.Optional(
        Type.Array(
          Type.Object({ rule: Type.String(), keep: StringEnum(['always', 'never'] as const) }),
          { description: 'One entry per conflict reported by `synthesis`' },
        ),
      ),
      sessionRules: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Extra rules for this Design alone, on top of the references\' guardrails',
        }),
      ),
      includeDeleted: Type.Optional(Type.Boolean({ description: 'Include Designs in Trash in `list`' })),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      const needsDesign = DESIGN_ID_ACTIONS.includes(params.action);
      const checkedDesign = needsDesign ? checkId(params.designId, 'design id') : null;
      if (checkedDesign && 'error' in checkedDesign) return checkedDesign.error;
      const designId = checkedDesign && 'id' in checkedDesign ? checkedDesign.id : '';

      const needsVariant = VARIANT_ID_ACTIONS.includes(params.action);
      const checkedVariant = needsVariant ? checkId(params.variantId, 'variant id') : null;
      if (checkedVariant && 'error' in checkedVariant) return checkedVariant.error;
      const variantId = checkedVariant && 'id' in checkedVariant ? checkedVariant.id : '';

      switch (params.action) {
        case 'list': {
          const state = await readState(paths);
          const designs = state.designs.filter(
            (design) => params.includeDeleted === true || design.deletedAt === undefined,
          );
          if (designs.length === 0) return text('No designs yet.', { designs: [] });
          const lines = designs.map((design) => {
            const ready = design.variants.filter((variant) => variant.status === 'ready').length;
            return `- ${design.id} — ${design.title} · ${design.target} · ${ready}/${design.variants.length} ready`;
          });
          return text(lines.join('\n'), { designs });
        }

        case 'get': {
          const design = normalizeDesignRecord(
            await readJsonFile<unknown>(designRecordFile(paths, designId)),
          );
          return design ? renderDesign(design) : failure(`No Design ${designId}.`);
        }

        case 'synthesis': {
          const references = await readReferences(paths, params.referenceItemIds ?? []);
          if ('error' in references) return references.error;
          const synthesis = synthesizeGuardrails(guardrailsOf(references.items));
          const lines = [
            `Always: ${synthesis.always.join('; ') || '—'}`,
            `Never: ${synthesis.never.join('; ') || '—'}`,
            synthesis.conflicts.length === 0
              ? 'No blocking conflicts.'
              : `Blocking conflicts (resolve each before create):\n${synthesis.conflicts
                  .map(
                    (conflict) =>
                      `- "${conflict.rule}" — required by ${conflict.alwaysFrom.join(', ')}, forbidden by ${conflict.neverFrom.join(', ')}`,
                  )
                  .join('\n')}`,
          ];
          return text(lines.join('\n'), { synthesis });
        }

        case 'create': {
          const references = await readReferences(paths, params.referenceItemIds ?? []);
          if ('error' in references) return references.error;

          const brief = briefFrom(params);
          if (brief.request.trim() === '') {
            return failure('`create` needs a request describing what to build.');
          }

          const unanalysed = references.items.filter((item) => item.analysis.status !== 'ready');
          if (unanalysed.length > 0) {
            return failure(
              `These references have no analysis yet: ${unanalysed.map((item) => item.id).join(', ')}. A Design is generated from the Librarian's reading of a reference, so analyse them first.`,
            );
          }

          const synthesis = synthesizeGuardrails(guardrailsOf(references.items));
          const resolutions: ConflictResolution[] = params.resolutions ?? [];
          const sessionRules = params.sessionRules ?? [];
          if (!applyResolutions(synthesis, resolutions, sessionRules)) {
            return failure(
              `Resolve these guardrail conflicts first (pass \`resolutions\`): ${synthesis.conflicts
                .map((conflict) => `"${conflict.rule}"`)
                .join(', ')}`,
            );
          }

          const designId = randomUUID();
          await appendRequest(paths, {
            kind: 'design.create',
            designId,
            title: params.title ?? '',
            brief,
            referenceItemIds: references.items.map((item) => item.id),
            resolutions,
            sessionRules,
          });
          const count = plannedVariantCount(brief, references.items.length);
          return text(
            `Queued a ${brief.target} Design with ${count} variant${count === 1 ? '' : 's'}.`,
            { designId, variantCount: count },
          );
        }

        case 'open': {
          await appendRequest(paths, { kind: 'view.set', patch: { selectedDesignId: designId } });
          return text('Opened.');
        }

        case 'rename': {
          if (!params.title) return failure('`rename` needs a title.');
          await appendRequest(paths, { kind: 'design.rename', designId, title: params.title });
          return text('Queued the rename.');
        }

        case 'retry-variant': {
          await appendRequest(paths, { kind: 'design.retry-variant', designId, variantId });
          return text('Queued a retry for that variant. Its siblings are untouched.');
        }

        case 'cancel-variant': {
          await appendRequest(paths, { kind: 'design.cancel-variant', designId, variantId });
          return text('Cancelling that variant. Its siblings keep running.');
        }

        case 'delete': {
          await appendRequest(paths, { kind: 'design.delete', designId });
          return text('Moved to Trash. Restore it any time; nothing generated is removed.');
        }

        case 'restore': {
          await appendRequest(paths, { kind: 'design.restore', designId });
          return text('Restored.');
        }
      }
    },
  });
}
