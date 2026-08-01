/**
 * Asking a model for a clip, and asking one for a single pose.
 *
 * The provider itself is the Design Library's — Sprite Studio shares the fal
 * connection and the settings and nothing else (D6) — so this file is a seam
 * rather than an adapter: it says which capability, which endpoint and what
 * resolution, and hands back local paths. No vendor type appears here, and no
 * remote URL survives the call.
 *
 * The model is a **visible choice in the interface** (D29), so the endpoint id
 * arrives from the request rather than from settings. What settings decide is
 * only what the choice defaults to next time.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { MediaAttempt } from '../../shared/media';
import type { MediaProvider, MediaSourceAsset } from '../../runtime/media/contract';
import { executeMedia } from '../../runtime/media/execute';
import { CHARACTER_MODEL, REPAIR_MODEL } from '../shared/video-models';

/** What a clip is drawn at when nothing says otherwise (D31). */
export const RESOLUTION = '720p';
/**
 * How long a clip runs.
 *
 * Five seconds at 12 fps is about sixty sampled frames, which thins to ten. A
 * longer clip costs more and gives the model more room to drift; a shorter one
 * does not contain a whole movement.
 */
export const CLIP_SECONDS = 5;

export interface ClipRequest {
  /** The endpoint the user chose, opaque everywhere but the adapter. */
  model: string;
  /** The motion instruction the AI wrote. */
  prompt: string;
  /** The plate: the character on flat magenta. */
  plate: { path: string; bytes: Buffer };
  /**
   * The picture the clip should finish on, when the endpoint takes one.
   *
   * Setting it to the plate makes closure the model's job instead of ours, and
   * on the two worst walks it roughly halved the join — 59.3% to 33.4%, and
   * 36.9% to 19.7% (D38). It is not adopted as a default because it halves the
   * problem rather than removing it, and because the endpoint that takes it is
   * the model that barely animates. It is wired here so trying it costs one
   * call rather than a build.
   */
  endFrame?: { path: string; bytes: Buffer };
  seconds?: number;
  /** Defaults to 720p. The setting exists so a test can ask for less. */
  resolution?: string;
  signal: AbortSignal;
  /** Where the clip lands, inside plugin storage. */
  directory: string;
  onProgress?(message: string): void;
}

function sourceAsset(file: { path: string; bytes: Buffer }, mediaType = 'image/png'): MediaSourceAsset {
  return { path: file.path, bytes: file.bytes, mediaType };
}

/**
 * One clip.
 *
 * The attempt is returned as data rather than thrown, the way the Library's
 * media path does it: a provider failure is an outcome the animation can report
 * and offer a retry for, not an exception unwinding the run that paid for it.
 */
export async function requestClip(
  provider: MediaProvider,
  request: ClipRequest,
): Promise<MediaAttempt> {
  await mkdir(request.directory, { recursive: true });
  const assets = new Map<string, MediaSourceAsset>([['plate', sourceAsset(request.plate)]]);
  if (request.endFrame) assets.set('end-frame', sourceAsset(request.endFrame));

  return executeMedia(
    provider,
    {
      capability: 'image-to-video',
      model: request.model,
      prompt: request.prompt,
      // The plate, and the end frame after it when one was asked for. The
      // adapter puts a second source in `end_image_url` on the endpoints that
      // declare one, and ignores it on the endpoints that do not.
      sourceAssetIds: [...assets.keys()],
      durationSeconds: request.seconds ?? CLIP_SECONDS,
      // Every one of these is dropped by the adapter for an endpoint that does
      // not declare it, because fal refuses a request carrying a field it has
      // never heard of — and Grok has no audio switch while Seedance does.
      extra: {
        resolution: request.resolution ?? RESOLUTION,
        // Asked for explicitly rather than left to the endpoint's default: a
        // clip with sound is a clip we pay to download and then discard.
        generate_audio: false,
      },
    },
    {
      directory: request.directory,
      signal: request.signal,
      readAsset: async (assetId) => {
        const asset = assets.get(assetId);
        if (asset === undefined) throw new Error(`No source asset named ${assetId}.`);
        return asset;
      },
      ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
    },
  );
}

/**
 * The aspect ratios these endpoints will accept, widest first.
 *
 * Asked for explicitly, because leaving it out is what broke the repair path:
 * given a landscape frame and a portrait character reference, four of six
 * endpoints returned the reference's shape. The scale is derived from the
 * returned width, so a portrait answer measured a 136 pixel character as 462 and
 * every check refused it after the call was paid for.
 */
const ASPECT_RATIOS: readonly [string, number][] = [
  ['21:9', 21 / 9],
  ['16:9', 16 / 9],
  ['3:2', 3 / 2],
  ['4:3', 4 / 3],
  ['5:4', 5 / 4],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['3:4', 3 / 4],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
];

/** The nearest ratio the endpoint has a name for. */
export function closestAspectRatio(width: number, height: number): string {
  const wanted = height === 0 ? 1 : width / height;
  return ASPECT_RATIOS.reduce((best, entry) =>
    Math.abs(entry[1] - wanted) < Math.abs(best[1] - wanted) ? entry : best,
  )[0];
}

export interface PoseRequest {
  /** The frame to redraw, and the character to hold on to. */
  plate: { path: string; bytes: Buffer; width: number; height: number };
  reference: { path: string; bytes: Buffer };
  /** What is wrong with it, named. */
  prompt: string;
  model?: string;
  signal: AbortSignal;
  directory: string;
  onProgress?(message: string): void;
}

/**
 * One redrawn pose (D10).
 *
 * The endpoint is **not** used to build a sequence: even the best model measured
 * changed 14% to 78% of the sprite between frames, so a sequence built from
 * single poses pops rather than flows. Its job is repairing a frame the video
 * route got wrong — see `REPAIR_MODEL` for which endpoint can actually do that
 * and how the others failed.
 */
export async function requestPose(
  provider: MediaProvider,
  request: PoseRequest,
): Promise<MediaAttempt> {
  await mkdir(request.directory, { recursive: true });
  const assets = new Map<string, MediaSourceAsset>([
    ['frame', sourceAsset(request.plate)],
    ['character', sourceAsset(request.reference)],
  ]);

  return executeMedia(
    provider,
    {
      capability: 'image-to-image',
      model: request.model ?? REPAIR_MODEL,
      prompt: request.prompt,
      sourceAssetIds: [...assets.keys()],
      // Both are dropped by the adapter on an endpoint that does not declare
      // them. The shape stops a model answering in the reference's proportions;
      // PNG stops one answering in JPEG, whose ringing on flat pixel art is
      // colours the quantiser then has to undo.
      extra: {
        aspect_ratio: closestAspectRatio(request.plate.width, request.plate.height),
        output_format: 'png',
      },
    },
    {
      directory: request.directory,
      signal: request.signal,
      readAsset: async (assetId) => {
        const asset = assets.get(assetId);
        if (asset === undefined) throw new Error(`No source asset named ${assetId}.`);
        return asset;
      },
      ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
    },
  );
}

/**
 * A character drawn from words alone (spec §2.1).
 *
 * The only call in the studio that starts from nothing. What comes back goes
 * through exactly the same ingestion as a picture the user supplied — the art
 * grid is measured rather than assumed, because a model asked for pixel art
 * returns artwork enlarged by whatever factor it felt like.
 */
export async function requestCharacterImage(
  provider: MediaProvider,
  request: {
    prompt: string;
    model?: string;
    directory: string;
    signal: AbortSignal;
    onProgress?(message: string): void;
  },
): Promise<MediaAttempt> {
  await mkdir(request.directory, { recursive: true });
  return executeMedia(
    provider,
    {
      capability: 'text-to-image',
      model: request.model ?? CHARACTER_MODEL,
      prompt: request.prompt,
    },
    {
      directory: request.directory,
      signal: request.signal,
      readAsset: async () => {
        throw new Error('Drawing a character from words uses no source picture.');
      },
      ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
    },
  );
}

/** The file an attempt produced, or null when it failed. */
export function attemptFile(attempt: MediaAttempt, directory: string): string | null {
  return attempt.outcome === 'ready' && attempt.file !== undefined
    ? path.join(directory, attempt.file)
    : null;
}

export function attemptProblem(attempt: MediaAttempt): string | null {
  if (attempt.outcome !== 'failed') return null;
  return attempt.error?.message ?? 'The provider failed without saying why.';
}
