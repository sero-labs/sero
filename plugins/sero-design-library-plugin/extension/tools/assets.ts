/**
 * `design_library_assets` — the single bounded ingestion pipeline.
 *
 * File picker, drag-and-drop and clipboard paste all converge here: the UI
 * opens an upload, streams base64 chunks of a bounded size, then finishes it.
 * No binary ever enters reactive state, and no bespoke preload API is needed.
 */

import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { assertSafeId, itemDir, uploadDir } from '../../shared/paths';
import { newId } from '../../shared/ids';
import { readJsonFile } from '../../shared/state-io';
import type { LibraryItemRecord } from '../../shared/records';
import { fail, image, ok, resolvePaths, submitRequest, type ToolOutput } from '../context';

/** 512 KiB of base64 per chunk keeps a single tool call comfortably bounded. */
export const MAX_CHUNK_BASE64_LENGTH = 512 * 1024;
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const Params = Type.Object({
  action: StringEnum([
    'upload_begin',
    'upload_chunk',
    'upload_finish',
    'upload_cancel',
    'read_preview',
    'read_original',
  ] as const),
  uploadId: Type.Optional(Type.String()),
  itemId: Type.Optional(Type.String()),
  fileName: Type.Optional(Type.String()),
  mimeType: Type.Optional(Type.String()),
  source: Type.Optional(StringEnum(['file-picker', 'drag-drop', 'clipboard'] as const)),
  chunk: Type.Optional(Type.String({ description: 'Base64 chunk of the file' })),
});

interface UploadManifest {
  uploadId: string;
  fileName: string;
  mimeType: string;
  source: string;
  createdAt: number;
}

async function readItem(dir: string): Promise<LibraryItemRecord | null> {
  return readJsonFile<LibraryItemRecord>(path.join(dir, 'record.json'));
}

export function createAssetsTool(): ToolDefinition<typeof Params> {
  return {
    name: 'design_library_assets',
    label: 'Design Library assets',
    description:
      'Bounded image ingestion and asset reads for the Design Library. Actions: '
      + 'upload_begin (fileName, mimeType, source), upload_chunk (uploadId, chunk), '
      + 'upload_finish (uploadId), upload_cancel (uploadId), read_preview (itemId), '
      + 'read_original (itemId).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);

      switch (params.action) {
        case 'upload_begin': {
          if (!params.fileName || !params.mimeType) {
            return fail('fileName and mimeType are required.');
          }
          if (!params.mimeType.startsWith('image/')) {
            return fail(`Unsupported type ${params.mimeType}. The first release imports images only.`);
          }
          const uploadId = newId('upl');
          const dir = uploadDir(paths, uploadId);
          await mkdir(dir, { recursive: true });
          const manifest: UploadManifest = {
            uploadId,
            fileName: params.fileName,
            mimeType: params.mimeType,
            source: params.source ?? 'file-picker',
            createdAt: Date.now(),
          };
          await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
          return ok(`Upload ${uploadId} opened.`, { uploadId, maxChunkLength: MAX_CHUNK_BASE64_LENGTH });
        }

        case 'upload_chunk': {
          if (!params.uploadId || !params.chunk) return fail('uploadId and chunk are required.');
          assertSafeId(params.uploadId, 'uploadId');
          if (params.chunk.length > MAX_CHUNK_BASE64_LENGTH) {
            return fail(`Chunk exceeds the ${MAX_CHUNK_BASE64_LENGTH} character limit.`);
          }
          const dir = uploadDir(paths, params.uploadId);
          const target = path.join(dir, 'payload.bin');
          const existing = await stat(target).catch(() => null);
          const bytes = Buffer.from(params.chunk, 'base64');
          if ((existing?.size ?? 0) + bytes.byteLength > MAX_UPLOAD_BYTES) {
            await rm(dir, { recursive: true, force: true });
            return fail(`Uploads are limited to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
          }
          await appendFile(target, bytes);
          return ok('Chunk stored.', { uploadId: params.uploadId });
        }

        case 'upload_finish': {
          if (!params.uploadId) return fail('uploadId is required.');
          assertSafeId(params.uploadId, 'uploadId');
          const dir = uploadDir(paths, params.uploadId);
          const manifest = await readJsonFile<UploadManifest>(path.join(dir, 'manifest.json'));
          if (!manifest) return fail(`Unknown upload ${params.uploadId}.`);
          const payload = await readFile(path.join(dir, 'payload.bin')).catch(() => null);
          if (!payload || payload.byteLength === 0) return fail('The upload has no content.');

          const checksum = createHash('sha256').update(payload).digest('hex');
          const state = await readJsonFile<{ items?: Array<{ id: string; checksum?: string; deletedAt?: number }> }>(
            paths.stateFile,
          );
          const duplicate = state?.items?.find((item) => item.checksum === checksum);
          if (duplicate) {
            await rm(dir, { recursive: true, force: true });
            return ok(`This image is already in the Library as ${duplicate.id}.`, {
              duplicate: true,
              itemId: duplicate.id,
            });
          }

          const requestId = await submitRequest(paths, 'item.ingest-upload', {
            uploadId: params.uploadId,
            source: manifest.source,
            fileName: manifest.fileName,
          });
          return ok('Import queued.', { duplicate: false, uploadId: params.uploadId, requestId });
        }

        case 'upload_cancel': {
          if (!params.uploadId) return fail('uploadId is required.');
          assertSafeId(params.uploadId, 'uploadId');
          await rm(uploadDir(paths, params.uploadId), { recursive: true, force: true });
          return ok('Upload cancelled.');
        }

        case 'read_preview':
        case 'read_original': {
          if (!params.itemId) return fail('itemId is required.');
          assertSafeId(params.itemId, 'itemId');
          const dir = itemDir(paths, params.itemId);
          const record = await readItem(dir);
          if (!record) return fail(`Unknown Library item ${params.itemId}.`);
          const asset = params.action === 'read_preview' ? record.preview : record.original;
          const bytes = await readFile(path.join(dir, asset.fileName)).catch(() => null);
          if (!bytes) return fail('The stored asset is missing.');
          return image(bytes.toString('base64'), asset.mimeType, `${record.id} ${asset.fileName}`, {
            itemId: record.id,
            byteLength: asset.byteLength,
          });
        }
      }
    },
  };
}
