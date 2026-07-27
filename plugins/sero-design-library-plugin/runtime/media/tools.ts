import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { DesignAsset, MediaCapability, StoredMediaRequest } from '../../shared/media';
import { needsSource } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designAssetDir } from '../../shared/paths';
import type { MediaProvider } from './contract';
import type { MediaBudget } from './budget';
import { createSourceResolver, recordAttempt, reserveAsset } from './assets';
import { executeMedia } from './execute';

/**
 * The media capabilities, as tools (spec §8.4, D5).
 *
 * One tool per capability rather than one tool with a mode: the model chooses a
 * *capability* and never an endpoint, and four narrow descriptions say when each
 * is worth using far better than one description covering all four.
 *
 * The same definitions serve both entry points. Inside a generation run they go
 * in as `customTools` and execute in-process here; for the main Sero agent the
 * extension bridges an equivalent surface through the request log. One
 * implementation, so the two cannot drift (D5).
 */

const ARTWORK_GUIDANCE =
  'Use this for illustrative artwork only — hero imagery, textures, abstract graphics. ' +
  'Routine interface icons come from the bundled icon set; do not generate them. ' +
  'The file is stored locally and you refer to it by the reference this tool returns.';

export interface MediaToolContext {
  paths: DesignLibraryPaths;
  designId: string;
  provider: MediaProvider;
  budget: MediaBudget;
  signal: AbortSignal;
  /** The generation job these calls belong to, for provenance on the asset. */
  jobId?: string;
  originVariantId?: string;
  onProgress?(message: string): void;
}

interface CapabilityShape {
  name: string;
  label: string;
  summary: string;
  parameters: ReturnType<typeof Type.Object>;
}

const SHAPES: Record<MediaCapability, CapabilityShape> = {
  'text-to-image': {
    name: 'design_library_generate_image',
    label: 'Generate Image',
    summary: 'Generates original artwork from a description.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'What the image should show, in detail.' }),
      aspectRatio: Type.Optional(
        Type.String({ description: 'e.g. `16:9`, `1:1`, `9:16`. Defaults to the model’s own.' }),
      ),
      seed: Type.Optional(Type.Number({ description: 'For a repeatable result.' })),
    }),
  },
  'image-to-image': {
    name: 'design_library_restyle_image',
    label: 'Restyle Image',
    summary: 'Produces a new image from an existing one plus an instruction.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'How the source should change.' }),
      sourceId: Type.String({ description: 'Id of an asset you generated, or a Library item.' }),
      aspectRatio: Type.Optional(Type.String()),
      seed: Type.Optional(Type.Number()),
    }),
  },
  upscale: {
    name: 'design_library_upscale_image',
    label: 'Upscale Image',
    summary: 'Increases the resolution of an image already stored locally.',
    parameters: Type.Object({
      sourceId: Type.String({ description: 'Id of an asset you generated, or a Library item.' }),
      prompt: Type.Optional(Type.String({ description: 'Optional guidance for the upscaler.' })),
    }),
  },
  'text-to-video': {
    name: 'design_library_generate_video',
    label: 'Generate Video',
    summary:
      'Generates a short video from a description. This always asks the user first and is the most expensive capability, so use it only when motion is the point.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'What the video should show, including the motion.' }),
      durationSeconds: Type.Optional(Type.Number({ description: 'Seconds of footage.' })),
      aspectRatio: Type.Optional(Type.String()),
    }),
  },
};

function toRequest(capability: MediaCapability, params: Record<string, unknown>): StoredMediaRequest {
  const optionalString = (value: unknown) =>
    typeof value === 'string' && value !== '' ? value : undefined;
  const optionalNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const source = optionalString(params.sourceId);
  const aspectRatio = optionalString(params.aspectRatio);
  const seed = optionalNumber(params.seed);
  const durationSeconds = optionalNumber(params.durationSeconds);

  return {
    capability,
    prompt: optionalString(params.prompt) ?? '',
    ...(source === undefined ? {} : { sourceAssetIds: [source] }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(seed === undefined ? {} : { seed }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], details: { ok: false }, isError: true };
}

function toolText(message: string, details: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: message }], details: { ok: true, ...details } };
}

/**
 * Run one capability and record the result.
 *
 * Shared by every tool and by the explicit actions, so a failed provider call
 * behaves identically whichever asked for it: an asset that exists, carries a
 * placeholder and offers a retry.
 */
export async function generateAsset(
  capability: MediaCapability,
  request: StoredMediaRequest,
  context: MediaToolContext,
): Promise<{ asset: DesignAsset } | { refused: string }> {
  const model = request.model ?? context.provider.defaultModel(capability);
  const decision = await context.budget.claim(capability, { prompt: request.prompt, model });
  if (!decision.allowed) return { refused: decision.reason };

  const asset = await reserveAsset(context.paths, context.designId, request, {
    ...(context.jobId === undefined ? {} : { jobId: context.jobId }),
    ...(context.originVariantId === undefined
      ? {}
      : { originVariantId: context.originVariantId }),
  });
  if (asset === null) return { refused: 'That Design no longer exists.' };

  return { asset: await attemptAsset(asset, { ...request, model }, context) };
}

/**
 * Try again for an asset that already exists (spec §6.6).
 *
 * Deliberately not "generate a replacement": the asset keeps its id, its
 * reference and its failed attempt, so a page already pointing at it picks the
 * new artwork up without being rewritten, and the history of what went wrong
 * survives. The stored request is replayed rather than rebuilt, so a retry
 * months later produces what was originally asked for.
 */
export async function retryAsset(
  asset: DesignAsset,
  context: MediaToolContext,
): Promise<{ asset: DesignAsset } | { refused: string }> {
  const model =
    asset.request.model ?? context.provider.defaultModel(asset.request.capability);
  const decision = await context.budget.claim(asset.request.capability, {
    prompt: asset.request.prompt,
    model,
  });
  if (!decision.allowed) return { refused: decision.reason };

  return { asset: await attemptAsset(asset, { ...asset.request, model }, context) };
}

/** Run one attempt against an asset that has already been reserved. */
async function attemptAsset(
  asset: DesignAsset,
  request: StoredMediaRequest,
  context: MediaToolContext,
): Promise<DesignAsset> {
  const attempt = await executeMedia(context.provider, request, {
    directory: designAssetDir(context.paths, context.designId, asset.id),
    signal: context.signal,
    readAsset: createSourceResolver(context.paths, context.designId),
    ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
  });

  if (attempt.provenance) context.budget.record(attempt.provenance);
  const stored = await recordAttempt(context.paths, context.designId, asset.id, attempt);
  // The record is the authority, but a Design deleted mid-call leaves nothing to
  // read back — and the caller still needs to be told what this attempt did.
  return stored ?? { ...asset, attempts: [...asset.attempts, attempt] };
}

function createCapabilityTool(
  capability: MediaCapability,
  context: MediaToolContext,
): ToolDefinition {
  const shape = SHAPES[capability];
  return {
    name: shape.name,
    label: shape.label,
    description: `${shape.summary} ${ARTWORK_GUIDANCE}`,
    promptSnippet: `${shape.name} — ${shape.summary}`,
    parameters: shape.parameters,
    async execute(_toolCallId, params) {
      const request = toRequest(capability, params as Record<string, unknown>);
      if (request.prompt.trim() === '' && capability !== 'upscale') {
        return toolError('This needs a prompt describing what to produce.');
      }
      if (needsSource(capability) && (request.sourceAssetIds ?? []).length === 0) {
        return toolError('This needs a `sourceId` naming an asset or Library item to work from.');
      }

      const outcome = await generateAsset(capability, request, context);
      // A refusal — the cap, or a video the user declined — is reported to the
      // model as an error it can work around, and the run carries on (D10).
      if ('refused' in outcome) return toolError(outcome.refused);

      const attempt = outcome.asset.attempts[outcome.asset.attempts.length - 1];
      if (attempt?.outcome !== 'ready') {
        return toolError(
          `${attempt?.error?.message ?? 'The provider failed.'} A placeholder is in the asset tray and can be retried there; carry on with the design.`,
        );
      }

      return toolText(
        `Stored as \`${outcome.asset.reference}\`. Refer to it with that path — it resolves inside the preview and the export.`,
        {
          assetId: outcome.asset.id,
          reference: outcome.asset.reference,
          ...(attempt.width === undefined ? {} : { width: attempt.width }),
          ...(attempt.height === undefined ? {} : { height: attempt.height }),
        },
      );
    },
  };
}

/** Every capability tool, for a generation run's `customTools`. */
export function createMediaTools(context: MediaToolContext): ToolDefinition[] {
  return (Object.keys(SHAPES) as MediaCapability[]).map((capability) =>
    createCapabilityTool(capability, context),
  );
}

export const MEDIA_TOOL_NAMES = Object.values(SHAPES).map((shape) => shape.name);
