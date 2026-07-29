import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { normalizeDesignRecord } from '../../shared/design-normalize';
import type { DesignAsset, MediaCapability, StoredMediaRequest } from '../../shared/media';
import {
  MAX_VIDEO_SECONDS,
  MEDIA_CAPABILITIES,
  assetCostUsd,
  boundedDuration,
  assetReferenceFor,
  currentAttempt,
  designCostUsd,
  missingRequirement,
  needsSource,
} from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designRecordFile } from '../../shared/paths';
import { appendRequest, readJsonFile } from '../../shared/state-io';
import { checkId, failure, text, type ToolResult } from './result';

/**
 * The media surface — asking for artwork, and managing what came back.
 *
 * Every action here is intent: it appends a request and the runtime does the
 * work, because a provider call costs money and the runtime is the only place
 * that holds the budget, the key and the job. The model inside a generation run
 * reaches the same capabilities through `customTools` instead, and both end in
 * `generateAsset` — one implementation, so the two routes cannot drift (D5).
 *
 * Ids for generation are allocated **here**, not in the handler. The request log
 * is applied at-least-once, so a handler that minted its own id would answer a
 * replay by generating a second asset and paying for it twice — the one
 * behaviour the spend rules exist to prevent (D10).
 */

const ACTIONS = [
  'list',
  'generate',
  'retry',
  'delete',
  'restore',
  'purge',
  'copy-to-library',
  'generate-into-library',
  'dismiss-job',
] as const;

/** Actions that address one asset inside one Design. */
const ASSET_ACTIONS: readonly string[] = [
  'retry',
  'delete',
  'restore',
  'purge',
  'copy-to-library',
];

const DESIGN_ID_ACTIONS: readonly string[] = ['list', 'generate', ...ASSET_ACTIONS];

function describeAsset(asset: DesignAsset): string {
  const attempt = currentAttempt(asset);
  const state =
    asset.deletedAt !== undefined
      ? 'deleted'
      : attempt === undefined
        ? asset.jobId === undefined
          ? 'interrupted — retryable'
          : 'generating'
        : attempt.outcome === 'ready'
          ? 'ready'
          : `failed — ${attempt.error?.message ?? 'the provider failed'}`;

  const cost = assetCostUsd(asset);
  const spent = cost === 0 ? '' : ` · $${cost.toFixed(3)}`;
  const tries = asset.attempts.length > 1 ? ` · ${asset.attempts.length} attempts` : '';
  const copied = asset.copiedItemId === undefined ? '' : ` · copied to Library (${asset.copiedItemId})`;
  return `- ${asset.id} · ${asset.request.capability} · ${state}${tries}${spent}${copied}\n  ${asset.reference} — ${asset.request.prompt || '(no prompt)'}`;
}

function requestFrom(
  capability: MediaCapability,
  params: {
    prompt?: string;
    sourceId?: string;
    aspectRatio?: string;
    seed?: number;
    durationSeconds?: number;
  },
): StoredMediaRequest {
  return {
    capability,
    prompt: params.prompt ?? '',
    ...(params.sourceId === undefined ? {} : { sourceAssetIds: [params.sourceId] }),
    ...(params.aspectRatio === undefined ? {} : { aspectRatio: params.aspectRatio }),
    ...(params.seed === undefined ? {} : { seed: params.seed }),
    ...(boundedDuration(params.durationSeconds) === undefined
      ? {}
      : { durationSeconds: boundedDuration(params.durationSeconds) }),
  };
}

export function registerMediaTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_media',
    label: 'Design Library Media',
    description:
      'Generate artwork and video for the Design Library. `generate` puts an asset in a Design\'s tray for its pages to use; `generate-into-library` makes a standalone Library item from a description, or a variation of an item you already have when you pass sourceItemId. Generation is illustrative artwork only — hero imagery, textures, abstract graphics — never routine interface icons. Video is the most expensive capability and always asks the user first.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which media operation to perform' }),
      designId: Type.Optional(Type.String({ description: 'The Design whose tray to work in' })),
      assetId: Type.Optional(Type.String({ description: 'Asset in that Design\'s tray' })),
      capability: Type.Optional(
        StringEnum(MEDIA_CAPABILITIES as MediaCapability[], {
          description:
            'text-to-image makes artwork from a description; image-to-image restyles a source; upscale raises a source\'s resolution; text-to-video makes a short clip',
        }),
      ),
      prompt: Type.Optional(
        Type.String({ description: 'What to produce, in detail. Optional guidance for upscale.' }),
      ),
      sourceId: Type.Optional(
        Type.String({
          description: 'For `generate` with image-to-image or upscale: a tray asset id or Library item id',
        }),
      ),
      sourceItemId: Type.Optional(
        Type.String({ description: 'For `generate-into-library`: the Library item to work from' }),
      ),
      aspectRatio: Type.Optional(Type.String({ description: 'e.g. `16:9`, `1:1`, `9:16`' })),
      seed: Type.Optional(Type.Number({ description: 'For a repeatable result' })),
      durationSeconds: Type.Optional(
        Type.Number({ description: `Seconds of footage, for video; up to ${MAX_VIDEO_SECONDS}` }),
      ),
      includeDeleted: Type.Optional(Type.Boolean({ description: 'Include deleted assets in `list`' })),
      jobId: Type.Optional(
        Type.String({ description: 'A finished job to forget, for `dismiss-job`' }),
      ),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      const needsDesign = DESIGN_ID_ACTIONS.includes(params.action);
      const checkedDesign = needsDesign ? checkId(params.designId, 'design id') : null;
      if (checkedDesign && 'error' in checkedDesign) return checkedDesign.error;
      const designId = checkedDesign && 'id' in checkedDesign ? checkedDesign.id : '';

      const needsAsset = ASSET_ACTIONS.includes(params.action);
      const checkedAsset = needsAsset ? checkId(params.assetId, 'asset id') : null;
      if (checkedAsset && 'error' in checkedAsset) return checkedAsset.error;
      const assetId = checkedAsset && 'id' in checkedAsset ? checkedAsset.id : '';

      switch (params.action) {
        case 'list': {
          const design = normalizeDesignRecord(
            await readJsonFile<unknown>(designRecordFile(paths, designId)),
          );
          if (!design) return failure(`No Design ${designId}.`);
          const assets = design.assets.filter(
            (asset) => params.includeDeleted === true || asset.deletedAt === undefined,
          );
          if (assets.length === 0) return text('No assets in this Design yet.', { assets: [] });
          const total = designCostUsd(assets);
          const lines = [
            ...assets.map(describeAsset),
            total === 0 ? '' : `Total: $${total.toFixed(3)}`,
          ].filter((line) => line !== '');
          return text(lines.join('\n'), { assets, designCostUsd: total });
        }

        case 'generate': {
          if (!params.capability) return failure('`generate` needs a capability.');
          const request = requestFrom(params.capability, params);
          const missing = missingRequirement(params.capability, {
            prompt: request.prompt,
            ...(request.sourceAssetIds === undefined
              ? {}
              : { sourceIds: request.sourceAssetIds }),
          });
          if (missing !== null) return failure(missing);
          if (params.sourceId !== undefined) {
            const checkedSource = checkId(params.sourceId, 'source id');
            if ('error' in checkedSource) return checkedSource.error;
          }

          // Allocated here so a replayed request finds the asset already
          // reserved rather than reserving — and paying for — a second one.
          const assetId = randomUUID();
          await appendRequest(paths, { kind: 'media.generate', designId, assetId, request });
          const reference = assetReferenceFor(assetId, params.capability);
          return text(
            `Generating. The asset is in the tray now and its artwork lands there when the provider answers; refer to it in the page as \`${reference}\`.`,
            { assetId, reference },
          );
        }

        case 'retry': {
          await appendRequest(paths, { kind: 'media.retry', designId, assetId });
          return text(
            'Retrying that asset. It keeps its id, its reference and the attempt that failed, so the page pointing at it needs no change.',
          );
        }

        case 'delete': {
          await appendRequest(paths, { kind: 'media.delete', designId, assetId, deleted: true });
          return text('Hidden from the tray. Restore it any time; the files stay.');
        }

        case 'restore': {
          await appendRequest(paths, { kind: 'media.delete', designId, assetId, deleted: false });
          return text('Restored.');
        }

        case 'purge': {
          await appendRequest(paths, { kind: 'media.purge', designId, assetId });
          return text('Removed permanently, along with every attempt\'s files.');
        }

        case 'copy-to-library': {
          await appendRequest(paths, { kind: 'media.copy-to-library', designId, assetId });
          return text(
            'Copying to the Library as an independent item. It gets its own bytes and keeps its generation provenance, so deleting this Design cannot alter it, and it analyses itself once it lands.',
          );
        }

        case 'generate-into-library': {
          const capability = params.capability ?? 'text-to-image';
          const missing = missingRequirement(
            capability,
            {
              prompt: params.prompt ?? '',
              ...(params.sourceItemId === undefined ? {} : { sourceIds: [params.sourceItemId] }),
            },
            'sourceItemId',
          );
          if (missing !== null) return failure(missing);
          if (params.sourceItemId !== undefined) {
            const checkedSource = checkId(params.sourceItemId, 'source item id');
            if ('error' in checkedSource) return checkedSource.error;
          }

          // The slot is what the grid renders a pending tile against, and — as
          // with an asset id — what makes a replayed request find its own job
          // instead of starting a second one.
          const slotId = randomUUID();
          await appendRequest(paths, {
            kind: 'library.generate',
            slotId,
            capability,
            prompt: params.prompt ?? '',
            ...(params.sourceItemId === undefined ? {} : { sourceItemId: params.sourceItemId }),
            ...(params.aspectRatio === undefined ? {} : { aspectRatio: params.aspectRatio }),
            ...(params.seed === undefined ? {} : { seed: params.seed }),
            ...(boundedDuration(params.durationSeconds) === undefined
              ? {}
              : { durationSeconds: boundedDuration(params.durationSeconds) }),
          });
          return text(
            needsSource(capability)
              ? 'Generating a variation into the Library. It arrives as an ordinary item and analyses itself.'
              : 'Generating into the Library. It arrives as an ordinary item and analyses itself.',
            { slotId },
          );
        }

        case 'dismiss-job': {
          const checked = checkId(params.jobId, 'job id');
          if ('error' in checked) return checked.error;
          await appendRequest(paths, { kind: 'job.dismiss', jobId: checked.id });
          // A job still running is refused by the runtime rather than here,
          // because only the runtime knows whether it has finished.
          return text('Forgotten, if it had finished. A running job is left alone.');
        }
      }
    },
  });
}
