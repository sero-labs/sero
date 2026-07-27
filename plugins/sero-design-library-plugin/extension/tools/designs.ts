/**
 * `design_library_designs` — the Design workbench surface, including the
 * Tweaks contract.
 *
 * Tweak updates are value-only: the tool accepts a map of declared control ids
 * to schema-valid values and nothing else. Selectors, CSS text and JavaScript
 * have no representation in this contract.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { assertSafeId, designRecordPath, revisionDir } from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import { buildTweakCss, normaliseTweakValue, resolveTweakValues } from '../../shared/tweaks';
import type { DesignRecord, VariantRevisionRecord } from '../../shared/records';
import type { TweakValue } from '../../shared/tweak-types';
import { fail, ok, resolvePaths, submitRequest, type ToolOutput } from '../context';

const Params = Type.Object({
  action: StringEnum([
    'create',
    'open',
    'generate',
    'revise',
    'resolve_conflict',
    'retry_variant',
    'cancel_variant',
    'delete',
    'restore',
    'read_preview',
    'update_tweak',
    'reset_tweak',
    'reset_all_tweaks',
    'checkpoint_tweaks',
    'copy_tweak_css',
  ] as const),
  designId: Type.Optional(Type.String()),
  variantId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  request: Type.Optional(Type.String()),
  outputTarget: Type.Optional(StringEnum(['html', 'react-tailwind'] as const)),
  itemIds: Type.Optional(Type.Array(Type.String())),
  variantCount: Type.Optional(Type.Number()),
  instruction: Type.Optional(Type.String()),
  behaviour: Type.Optional(StringEnum(['replace', 'retain'] as const)),
  always: Type.Optional(Type.String()),
  never: Type.Optional(Type.String()),
  resolution: Type.Optional(StringEnum(['keep-always', 'keep-never'] as const)),
  controlId: Type.Optional(Type.String()),
  overrides: Type.Optional(Type.Unknown({ description: 'Map of control id to value' })),
  reason: Type.Optional(
    StringEnum(['panel-closed', 'variant-changed', 'revision-started', 'gallery-save', 'shutdown'] as const),
  ),
});

function visibleRevision(design: DesignRecord, variantId: string): VariantRevisionRecord | null {
  const variant = design.variants.find((entry) => entry.id === variantId);
  if (!variant?.visibleRevisionId) return null;
  return variant.revisions.find((entry) => entry.id === variant.visibleRevisionId) ?? null;
}

/** Reject anything that is not a declared control id with an admissible value. */
function sanitiseOverrides(
  revision: VariantRevisionRecord,
  raw: unknown,
): { overrides: Record<string, TweakValue>; rejected: string[] } {
  const overrides: Record<string, TweakValue> = {};
  const rejected: string[] = [];
  if (!raw || typeof raw !== 'object') return { overrides, rejected };

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const definition = revision.tweakManifest.controls.find((control) => control.id === id);
    if (!definition) {
      rejected.push(`${id}: not declared by this revision's manifest`);
      continue;
    }
    const normalised = normaliseTweakValue(definition.control, value);
    if (normalised === null) {
      rejected.push(`${id}: value rejected by the control schema`);
      continue;
    }
    overrides[id] = normalised;
  }
  return { overrides, rejected };
}

export function createDesignsTool(): ToolDefinition<typeof Params> {
  return {
    name: 'design_library_designs',
    label: 'Design Library designs',
    description:
      'Create and work on Designs. Actions: create (title, request, outputTarget, itemIds), open, '
      + 'generate (variantCount), revise (variantId, instruction, behaviour), resolve_conflict, '
      + 'retry_variant, cancel_variant, delete, restore, read_preview (variantId), '
      + 'update_tweak (variantId, overrides), reset_tweak (controlId), reset_all_tweaks, '
      + 'checkpoint_tweaks (reason), copy_tweak_css (variantId).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);

      if (params.action === 'create') {
        if (!params.request || !params.itemIds?.length) {
          return fail('request and at least one Library reference are required.');
        }
        if (params.itemIds.length > 6) return fail('A Design supports at most six references.');
        params.itemIds.forEach((id) => assertSafeId(id, 'itemId'));
        const designId = newId('dsn');
        await submitRequest(paths, 'design.create', {
          designId,
          title: params.title ?? 'Untitled Design',
          request: params.request,
          outputTarget: params.outputTarget ?? 'html',
          itemIds: params.itemIds,
        });
        return ok(`Design ${designId} queued.`, { designId });
      }

      if (!params.designId) return fail('designId is required.');
      assertSafeId(params.designId, 'designId');
      const recordPath = designRecordPath(paths, params.designId);

      switch (params.action) {
        case 'open': {
          const design = await readJsonFile<DesignRecord>(recordPath);
          if (!design) return fail(`Unknown Design ${params.designId}.`);
          return ok(`${design.title} (${design.variants.length} variants)`, { design });
        }

        case 'generate': {
          await submitRequest(paths, 'design.generate', {
            designId: params.designId,
            variantCount: params.variantCount ?? 3,
          });
          return ok('Generation queued.');
        }

        case 'resolve_conflict': {
          if (!params.always || !params.never || !params.resolution) {
            return fail('always, never and resolution are required.');
          }
          await submitRequest(paths, 'design.resolve-conflict', {
            designId: params.designId,
            always: params.always,
            never: params.never,
            resolution: params.resolution,
          });
          return ok('Conflict resolution queued.');
        }

        case 'delete':
        case 'restore': {
          await submitRequest(
            paths,
            params.action === 'delete' ? 'design.delete' : 'design.restore',
            { designId: params.designId },
          );
          return ok(`${params.action} queued.`);
        }

        default:
          break;
      }

      if (!params.variantId) return fail('variantId is required.');
      assertSafeId(params.variantId, 'variantId');

      switch (params.action) {
        case 'revise': {
          if (!params.instruction) return fail('instruction is required.');
          await submitRequest(paths, 'design.revise', {
            designId: params.designId,
            variantId: params.variantId,
            instruction: params.instruction,
            behaviour: params.behaviour ?? 'replace',
          });
          return ok('Revision queued.');
        }

        case 'retry_variant':
        case 'cancel_variant': {
          await submitRequest(
            paths,
            params.action === 'retry_variant' ? 'design.retry-variant' : 'design.cancel-variant',
            { designId: params.designId, variantId: params.variantId },
          );
          return ok(`${params.action} queued.`);
        }

        case 'read_preview': {
          const design = await readJsonFile<DesignRecord>(recordPath);
          const revision = design ? visibleRevision(design, params.variantId) : null;
          if (!design || !revision) return fail('That variant has no visible revision yet.');
          const html = await readFile(
            path.join(revisionDir(paths, design.id, params.variantId, revision.id), 'preview.html'),
            'utf8',
          ).catch(() => null);
          if (html === null) return fail('The preview for that revision is missing.');
          const overrides = { ...revision.tweakOverrides, ...(design.variants
            .find((entry) => entry.id === params.variantId)?.tweakWorking?.overrides ?? {}) };
          return ok(html, {
            revisionId: revision.id,
            manifest: revision.tweakManifest,
            overrides,
            values: resolveTweakValues(revision.tweakManifest, overrides),
            dropped: revision.droppedTweakControls,
            outputTarget: revision.outputTarget,
          });
        }

        case 'update_tweak': {
          const design = await readJsonFile<DesignRecord>(recordPath);
          const revision = design ? visibleRevision(design, params.variantId) : null;
          if (!revision) return fail('That variant has no visible revision yet.');
          const { overrides, rejected } = sanitiseOverrides(revision, params.overrides);
          if (Object.keys(overrides).length === 0) {
            return fail(`No usable tweak values. ${rejected.join('; ')}`);
          }
          await submitRequest(paths, 'tweak.update', {
            designId: params.designId,
            variantId: params.variantId,
            overrides,
          });
          return ok('Tweak values saved.', { applied: overrides, rejected });
        }

        case 'reset_tweak':
        case 'reset_all_tweaks': {
          await submitRequest(paths, 'tweak.reset', {
            designId: params.designId,
            variantId: params.variantId,
            ...(params.action === 'reset_tweak' && params.controlId
              ? { controlId: params.controlId }
              : {}),
          });
          return ok('Reset queued.');
        }

        case 'checkpoint_tweaks': {
          await submitRequest(paths, 'tweak.checkpoint', {
            designId: params.designId,
            variantId: params.variantId,
            reason: params.reason ?? 'panel-closed',
          });
          return ok('Checkpoint queued.');
        }

        case 'copy_tweak_css': {
          const design = await readJsonFile<DesignRecord>(recordPath);
          const revision = design ? visibleRevision(design, params.variantId) : null;
          if (!design || !revision) return fail('That variant has no visible revision yet.');
          const working = design.variants.find((entry) => entry.id === params.variantId)?.tweakWorking;
          const overrides = { ...revision.tweakOverrides, ...(working?.overrides ?? {}) };
          const css = buildTweakCss(revision.tweakManifest, overrides);
          return ok(css || '/* No tweaks applied — the design is at its generated defaults. */', { css });
        }

        default:
          return fail(`Unsupported action ${params.action}.`);
      }
    },
  };
}
