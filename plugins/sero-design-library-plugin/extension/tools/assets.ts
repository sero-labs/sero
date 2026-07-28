import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
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
import { appendRequest, readJsonFile } from '../../shared/state-io';
import type { UploadManifest, UploadRole } from '../../shared/uploads';
import {
  UPLOAD_CHUNK_BYTES,
  beginUpload,
  completeUpload,
  discardUpload,
  writeUploadChunk,
} from '../../shared/uploads';
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
  'design-file',
  'design-asset',
] as const;

/**
 * Generated files are text, and the built preview document runs to hundreds of
 * kilobytes once React and Tailwind are inlined. Reading it as base64 through a
 * tool result would inflate it by a third for no reason, so it comes back as
 * text and the UI turns it into a blob itself.
 */
const MAX_DESIGN_FILE_BYTES = 4 * 1024 * 1024;

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

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

  // A lexical check cannot see a symlink. Resolving the real path and checking
  // it again is what stops a link inside the plugin's storage from becoming a
  // read of anything on the machine.
  //
  // Both sides are resolved, not just the file: on macOS the app directory
  // itself usually sits under a symlinked prefix (`/var` → `/private/var`), so
  // comparing a real path against the unresolved home would refuse every
  // legitimate read.
  const [real, realHome] = await Promise.all([
    realpath(resolved).catch(() => null),
    realpath(paths.home).catch(() => null),
  ]);
  if (real === null || realHome === null || !isInside(realHome, real)) {
    return failure('Refusing to read a path outside the Design Library directory.');
  }

  const content = await readFile(real, 'utf8');
  return text(content, { name: fileName, bytes: stats.size });
}

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function mediaTypeFor(filePath: string): string {
  return MEDIA_TYPES[path.extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

async function readItemAsset(
  paths: DesignLibraryPaths,
  itemId: string,
  which: 'preview' | 'original',
): Promise<ToolResult> {
  // The record names its own files, so the caller never supplies a path.
  const record = await readJsonFile<ItemRecord>(itemRecordFile(paths, itemId));
  if (!record) return failure(`No Library item ${itemId}.`);

  const fileName = which === 'preview' ? record.asset.previewFile : record.asset.originalFile;
  const resolved = resolveInsideHome(paths, `items/${itemId}/${fileName}`);
  if (!resolved) return failure('Refusing to read a path outside the Design Library directory.');

  const bytes = await readFile(resolved).catch(() => null);
  if (!bytes) return failure(`The ${which} for ${itemId} is missing.`);

  const title = effectiveField(record.profile, 'title');
  return image(bytes.toString('base64'), mediaTypeFor(resolved), `${title} (${which})`);
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

export function registerAssetTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_assets',
    label: 'Design Library Assets',
    description:
      'Import images into the Design Library and read stored item images. Import runs as begin → chunk (base64, 512 KiB max each) → complete.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS, { description: 'Which asset operation to perform' }),
      uploadId: Type.Optional(Type.String({ description: 'Returned by `begin`; required by chunk/complete/abort' })),
      itemId: Type.Optional(Type.String({ description: 'Required by preview/original' })),
      fileName: Type.Optional(Type.String()),
      mediaType: Type.Optional(Type.String({ description: 'e.g. image/png' })),
      previewMediaType: Type.Optional(Type.String({ description: 'Defaults to image/webp' })),
      kind: Type.Optional(StringEnum(['image', 'video'] as const)),
      sourceKind: Type.Optional(StringEnum(['file', 'drop', 'paste'] as const)),
      originalChunks: Type.Optional(Type.Number({ description: 'Chunk count for the original' })),
      previewChunks: Type.Optional(Type.Number({ description: 'Chunk count for the preview; 0 to send none' })),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      role: Type.Optional(StringEnum(['original', 'preview'] as const)),
      index: Type.Optional(Type.Number({ description: 'Zero-based chunk index' })),
      data: Type.Optional(Type.String({ description: 'Base64 chunk payload' })),
      designId: Type.Optional(Type.String({ description: 'Required by design-file and design-asset' })),
      variantId: Type.Optional(Type.String({ description: 'Required by design-file' })),
      revisionId: Type.Optional(Type.String({ description: 'Required by design-file' })),
      assetId: Type.Optional(Type.String({ description: 'Required by design-asset' })),
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
