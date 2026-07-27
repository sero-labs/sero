import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { effectiveField } from '../../shared/librarian';
import type { DesignLibraryPaths } from '../../shared/paths';
import { itemRecordFile, resolveInsideHome } from '../../shared/paths';
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
] as const;

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
          await completeUpload(paths, checked.id);
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
      }
    },
  });
}
