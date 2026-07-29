import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { normalizeDesignRecord } from '../../shared/design-normalize';
import { effectiveField } from '../../shared/librarian';
import { currentAttempt } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import {
  designAssetDir,
  designRecordFile,
  isSafeId,
  itemRecordFile,
  resolveInsideHome,
  revisionDir,
} from '../../shared/paths';
import type { ItemRecord } from '../../shared/records';
import type { LibraryRequestBody } from '../../shared/requests';
import { appendRequest, readJsonFile } from '../../shared/state-io';
import type { UploadManifest, UploadRole } from '../../shared/uploads';
import {
  UPLOAD_CHUNK_BYTES,
  beginUpload,
  completeUpload,
  discardUpload,
  writeUploadChunk,
} from '../../shared/uploads';
import {
  locationError,
  mediaTypeFor,
  readItemAsset,
  realPathInsideHome,
  streamItemAsset,
} from './item-files';
import { checkId, failure, image, text, type ToolResult } from './result';

/**
 * The asset surface — bytes in, bytes out.
 *
 * The UI has no filesystem access, so every image it shows arrives through
 * `preview`/`original` as a base64 content block, and every image it imports
 * leaves through `begin`/`chunk`/`complete`. Both directions are bounded:
 * chunks are capped, and a path the UI names is resolved inside the app state
 * directory or refused.
 */

const ACTIONS = [
  'begin',
  'chunk',
  'complete',
  'abort',
  'preview',
  'original',
  'stream',
  'design-file',
  'design-asset',
  'attach-frames',
] as const;

/**
 * Generated files are text, and the built preview document runs to hundreds of
 * kilobytes once React and Tailwind are inlined. Reading it as base64 through a
 * tool result would inflate it by a third for no reason, so it comes back as
 * text and the UI turns it into a blob itself.
 */
const MAX_DESIGN_FILE_BYTES = 4 * 1024 * 1024;

async function readDesignFile(
  paths: DesignLibraryPaths,
  designId: string,
  variantId: string,
  revisionId: string,
  fileName: string,
): Promise<ToolResult> {
  if (!isSafeId(fileName)) return failure(`${JSON.stringify(fileName)} is not a valid file name.`);

  // Built from checked ids rather than a caller-supplied path, then checked
  // again on the way out — the UI names every part of this and none of it is
  // trusted.
  const file = path.join(revisionDir(paths, designId, variantId, revisionId), fileName);
  const resolved = resolveInsideHome(paths, path.relative(paths.home, file));
  if (!resolved) return failure('Refusing to read a path outside the Design Library directory.');

  // Existence first, so a file that is simply not there says so. Deciding it
  // afterwards would report every missing file as a refused path, which is both
  // wrong and the more alarming of the two messages.
  const stats = await stat(resolved).catch(() => null);
  if (!stats?.isFile()) return failure(`No file ${fileName} in that revision.`);
  if (stats.size > MAX_DESIGN_FILE_BYTES) {
    return failure(`${fileName} is ${Math.round(stats.size / 1024)} KB, too large to read.`);
  }

  const located = await realPathInsideHome(paths, path.relative(paths.home, file));
  if ('error' in located) return locationError(located, `${fileName}`);

  const content = await readFile(located.path, 'utf8');
  return text(content, { name: fileName, bytes: stats.size });
}


/**
 * Read what a Design asset currently shows (spec §6.6).
 *
 * The record names the file, exactly as an item's record does, so the caller
 * never supplies a path. `poster` is the still frame a video carries: a tray of
 * assets paints from posters rather than decoding video, and a video whose frame
 * has not been captured yet has none to give.
 */
async function readDesignAsset(
  paths: DesignLibraryPaths,
  designId: string,
  assetId: string,
  which: 'media' | 'poster',
): Promise<ToolResult> {
  const design = normalizeDesignRecord(
    await readJsonFile<unknown>(designRecordFile(paths, designId)),
  );
  const asset = design?.assets.find((entry) => entry.id === assetId);
  if (!asset) return failure(`No asset ${assetId} in Design ${designId}.`);

  const attempt = currentAttempt(asset);
  if (attempt?.outcome !== 'ready') {
    // Not an error: a pending or failed asset is an ordinary tray state, and the
    // tray needs to tell the two apart to choose between a spinner and a retry.
    return text('That asset has no artwork yet.', {
      ok: false,
      state: asset.attempts.length === 0 ? 'pending' : 'failed',
    });
  }

  const fileName = which === 'poster' ? attempt.posterFile : attempt.file;
  if (fileName === undefined) {
    return text(
      which === 'poster'
        ? 'That video has no still frame yet.'
        : 'That attempt stored no file.',
      { ok: false, state: which === 'poster' ? 'awaiting-frames' : 'failed' },
    );
  }

  const resolved = resolveInsideHome(
    paths,
    path.relative(paths.home, path.join(designAssetDir(paths, designId, assetId), fileName)),
  );
  if (!resolved) return failure('Refusing to read a path outside the Design Library directory.');

  const bytes = await readFile(resolved).catch(() => null);
  if (!bytes) return failure(`The ${which} for asset ${assetId} is missing.`);

  const mediaType = which === 'poster' ? mediaTypeFor(resolved) : attempt.mediaType ?? mediaTypeFor(resolved);
  return image(bytes.toString('base64'), mediaType, asset.request.prompt || asset.reference);
}

type FramesTarget = Extract<LibraryRequestBody, { kind: 'frames.attach' }>['target'];

/**
 * What the captured frames belong to — a Library item, or a Design asset.
 *
 * Named by the caller and checked here, because both ids build filesystem paths
 * on the far side and the caller is the renderer.
 */
function framesTarget(params: {
  itemId?: string;
  designId?: string;
  assetId?: string;
  attemptId?: string;
}): { target: FramesTarget } | { error: ToolResult } {
  if (params.itemId !== undefined) {
    const checked = checkId(params.itemId, 'item id');
    return 'error' in checked ? checked : { target: { kind: 'item', itemId: checked.id } };
  }

  const design = checkId(params.designId, 'design id');
  if ('error' in design) return design;
  const asset = checkId(params.assetId, 'asset id');
  if ('error' in asset) return asset;
  // Required, not optional: without it the runtime cannot tell frames captured
  // from the clip on show from frames captured before a retry replaced it.
  const attempt = checkId(params.attemptId, 'attempt id');
  if ('error' in attempt) return attempt;
  return {
    target: { kind: 'asset', designId: design.id, assetId: asset.id, attemptId: attempt.id },
  };
}

export function registerAssetTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_assets',
    label: 'Design Library Assets',
    description:
      'Import images into the Design Library and read stored item images. Import runs as begin → chunk (base64, 512 KiB max each) → complete.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which asset operation to perform' }),
      uploadId: Type.Optional(Type.String({ description: 'Returned by `begin`; required by chunk/complete/abort' })),
      itemId: Type.Optional(Type.String({ description: 'Required by preview/original/stream' })),
      offset: Type.Optional(
        Type.Number({ description: 'Byte to start at, for `stream`. Defaults to 0.' }),
      ),
      fileName: Type.Optional(Type.String()),
      mediaType: Type.Optional(Type.String({ description: 'e.g. image/png' })),
      previewMediaType: Type.Optional(Type.String({ description: 'Defaults to image/webp' })),
      kind: Type.Optional(StringEnum(['image', 'video'] as const)),
      sourceKind: Type.Optional(StringEnum(['file', 'drop', 'paste'] as const)),
      originalChunks: Type.Optional(Type.Number({ description: 'Chunk count for the original' })),
      previewChunks: Type.Optional(Type.Number({ description: 'Chunk count for the preview; 0 to send none' })),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      role: Type.Optional(StringEnum(['original', 'preview', 'frames'] as const)),
      framesChunks: Type.Optional(
        Type.Number({ description: 'Chunk count for a video filmstrip; 0 to send none' }),
      ),
      index: Type.Optional(Type.Number({ description: 'Zero-based chunk index' })),
      data: Type.Optional(Type.String({ description: 'Base64 chunk payload' })),
      designId: Type.Optional(Type.String({ description: 'Required by design-file and design-asset' })),
      variantId: Type.Optional(Type.String({ description: 'Required by design-file' })),
      revisionId: Type.Optional(Type.String({ description: 'Required by design-file' })),
      assetId: Type.Optional(Type.String({ description: 'Required by design-asset' })),
      attemptId: Type.Optional(
        Type.String({ description: 'The attempt frames were captured from, for attach-frames' }),
      ),
      which: Type.Optional(
        StringEnum(['media', 'poster'] as const, {
          description: 'design-asset: the artwork itself, or a video’s still frame',
        }),
      ),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      switch (params.action) {
        case 'begin': {
          if (!params.fileName || !params.mediaType) {
            return failure('`begin` needs fileName and mediaType.');
          }
          // Importing your own video is deferred to a later release. The
          // renderer filters for images too; this is the boundary that holds
          // when the caller is the agent rather than the file picker.
          if (!params.mediaType.startsWith('image/')) {
            return failure(
              `Only images can be imported (got ${params.mediaType}). Video references are not supported yet.`,
            );
          }
          const manifest: UploadManifest = {
            id: randomUUID(),
            fileName: params.fileName,
            mediaType: params.mediaType,
            kind: 'image',
            sourceKind: params.sourceKind ?? 'file',
            chunkCounts: {
              original: params.originalChunks ?? 0,
              preview: params.previewChunks ?? 0,
              frames: params.framesChunks ?? 0,
            },
            previewMediaType: params.previewMediaType ?? 'image/webp',
            ...(params.width === undefined ? {} : { width: params.width }),
            ...(params.height === undefined ? {} : { height: params.height }),
            createdAt: Date.now(),
            complete: false,
          };
          await beginUpload(paths, manifest);
          return text(`Upload ${manifest.id} ready for ${manifest.chunkCounts.original} chunks.`, {
            uploadId: manifest.id,
            chunkBytes: UPLOAD_CHUNK_BYTES,
          });
        }

        case 'chunk': {
          if (params.data === undefined || params.index === undefined) {
            return failure('`chunk` needs uploadId, index and data.');
          }
          const checked = checkId(params.uploadId, 'upload id');
          if ('error' in checked) return checked.error;
          const role: UploadRole = params.role ?? 'original';
          const written = await writeUploadChunk(paths, checked.id, role, params.index, params.data);
          return text(`Stored ${role} chunk ${params.index} (${written} bytes).`, { written });
        }

        case 'complete': {
          const checked = checkId(params.uploadId, 'upload id');
          if ('error' in checked) return checked.error;
          // An upload that cannot be assembled must not queue an import that is
          // certain to fail, so completion is what gates the request.
          const rejected = await completeUpload(paths, checked.id).then(
            () => null,
            (error: unknown) => (error instanceof Error ? error.message : String(error)),
          );
          if (rejected !== null) return failure(rejected);
          const requestId = await appendRequest(paths, { kind: 'ingest', uploadId: checked.id });
          return text('Upload complete; import queued.', { requestId });
        }

        case 'abort': {
          const checked = checkId(params.uploadId, 'upload id');
          if ('error' in checked) return checked.error;
          await discardUpload(paths, checked.id);
          return text('Upload discarded.');
        }

        case 'preview':
        case 'original': {
          const checked = checkId(params.itemId, 'item id');
          if ('error' in checked) return checked.error;
          return readItemAsset(paths, checked.id, params.action);
        }

        case 'stream': {
          const checked = checkId(params.itemId, 'item id');
          if ('error' in checked) return checked.error;
          const offset = params.offset ?? 0;
          if (!Number.isSafeInteger(offset) || offset < 0) {
            return failure(`${JSON.stringify(params.offset ?? null)} is not a valid offset.`);
          }
          return streamItemAsset(paths, checked.id, offset);
        }

        case 'design-file': {
          const design = checkId(params.designId, 'design id');
          if ('error' in design) return design.error;
          const variant = checkId(params.variantId, 'variant id');
          if ('error' in variant) return variant.error;
          const revision = checkId(params.revisionId, 'revision id');
          if ('error' in revision) return revision.error;
          if (params.fileName === undefined) return failure('`design-file` needs a fileName.');
          return readDesignFile(paths, design.id, variant.id, revision.id, params.fileName);
        }

        case 'attach-frames': {
          const checked = checkId(params.uploadId, 'upload id');
          if ('error' in checked) return checked.error;
          const target = framesTarget(params);
          if ('error' in target) return target.error;

          const rejected = await completeUpload(paths, checked.id).then(
            () => null,
            (error: unknown) => (error instanceof Error ? error.message : String(error)),
          );
          if (rejected !== null) return failure(rejected);

          await appendRequest(paths, {
            kind: 'frames.attach',
            uploadId: checked.id,
            target: target.target,
          });
          return text('Frames queued.');
        }

        case 'design-asset': {
          const design = checkId(params.designId, 'design id');
          if ('error' in design) return design.error;
          const asset = checkId(params.assetId, 'asset id');
          if ('error' in asset) return asset.error;
          return readDesignAsset(paths, design.id, asset.id, params.which ?? 'media');
        }
      }
    },
  });
}
