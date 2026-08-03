import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { readIndex } from '../../shared/index-storage';
import { normalizeGalleryIndex } from '../../shared/indexes';
import { normalizeGalleryVersion } from '../../shared/gallery';
import { normalizeDesignRecord } from '../../shared/design-normalize';
import type { DesignLibraryPaths } from '../../shared/paths';
import { designRecordFile, galleryVersionDir, galleryVersionRecordFile } from '../../shared/paths';
import { appendRequest, readJsonFile } from '../../shared/state-io';
import { readUploadManifest } from '../../shared/uploads';
import { checkId, failure, image, text, type ToolResult } from './result';

const ACTIONS = [
  'list',
  'get',
  'preview',
  'save',
  'feature',
  'favourite',
  'open',
  'duplicate',
  'delete-version',
  'restore-version',
  'purge-version',
  'delete-family',
  'restore-family',
  'purge-family',
] as const;

function required(value: string | undefined, label: string): { id: string } | { error: ToolResult } {
  return checkId(value, label);
}

export function registerGalleryTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_gallery',
    label: 'Design Library Gallery',
    description: 'Save, read and manage immutable Design Library Gallery versions.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS),
      familyId: Type.Optional(Type.String()),
      versionId: Type.Optional(Type.String()),
      designId: Type.Optional(Type.String()),
      variantId: Type.Optional(Type.String()),
      revisionId: Type.Optional(Type.String()),
      previewUploadId: Type.Optional(Type.String()),
      favourite: Type.Optional(Type.Boolean()),
      includeDeleted: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params): Promise<ToolResult> {
      if (params.action === 'list') {
        const families = (await readIndex(paths.galleryIndexFile, normalizeGalleryIndex)).filter(
          (family) => params.includeDeleted === true || family.deletedAt === undefined,
        );
        return text(
          families.length === 0
            ? 'Gallery is empty.'
            : families.map((family) =>
                `- ${family.id} — ${family.title} · ${family.versions.length} version(s)`,
              ).join('\n'),
          { families },
        );
      }

      if (params.action === 'save') {
        const design = required(params.designId, 'design id');
        if ('error' in design) return design.error;
        const variant = required(params.variantId, 'variant id');
        if ('error' in variant) return variant.error;
        const revision = required(params.revisionId, 'revision id');
        if ('error' in revision) return revision.error;
        const upload = required(params.previewUploadId, 'preview upload id');
        if ('error' in upload) return upload.error;
        const families = await readIndex(paths.galleryIndexFile, normalizeGalleryIndex);
        const record = normalizeDesignRecord(
          await readJsonFile<unknown>(designRecordFile(paths, design.id)),
        );
        if (!record) return failure(`No Design ${design.id}.`);
        const selectedVariant = record.variants.find((entry) => entry.id === variant.id);
        const selectedRevision = selectedVariant?.revisions.find((entry) => entry.id === revision.id);
        if (!selectedRevision?.builtFile) return failure('That Design revision has no preview to save.');
        const preview = await readUploadManifest(paths, upload.id);
        if (!preview?.complete || preview.purpose !== 'gallery-preview') {
          return failure('The Gallery preview upload is incomplete.');
        }
        const familyId = record.galleryFamilyId ?? families.find(
          (family) => family.sourceDesignId === design.id,
        )?.id ?? randomUUID();
        const versionId = randomUUID();
        await appendRequest(paths, {
          kind: 'gallery.save',
          familyId,
          versionId,
          designId: design.id,
          variantId: variant.id,
          revisionId: revision.id,
          previewUploadId: upload.id,
        });
        return text('Saving this exact revision to Gallery.', { familyId, versionId });
      }

      const family = required(params.familyId, 'family id');
      if ('error' in family) return family.error;

      if (params.action === 'delete-family' || params.action === 'restore-family') {
        await appendRequest(paths, {
          kind: 'gallery.delete-family',
          familyId: family.id,
          deleted: params.action === 'delete-family',
        });
        return text(params.action === 'delete-family' ? 'Moved the family to Trash.' : 'Restored.');
      }
      if (params.action === 'purge-family') {
        await appendRequest(paths, { kind: 'gallery.purge-family', familyId: family.id });
        return text('Permanently deleted the family and every version it owned.');
      }
      if (params.action === 'favourite') {
        await appendRequest(paths, {
          kind: 'gallery.favourite',
          familyId: family.id,
          favourite: params.favourite ?? true,
        });
        return text(params.favourite === false ? 'Removed from favourites.' : 'Added to favourites.');
      }

      const version = required(params.versionId, 'version id');
      if ('error' in version) return version.error;
      if (params.action === 'get') {
        const record = normalizeGalleryVersion(
          await readJsonFile<unknown>(galleryVersionRecordFile(paths, family.id, version.id)),
        );
        return record ? text(`${record.name} — ${record.summary}`, { version: record }) : failure('No such Gallery version.');
      }
      if (params.action === 'preview') {
        const record = normalizeGalleryVersion(
          await readJsonFile<unknown>(galleryVersionRecordFile(paths, family.id, version.id)),
        );
        if (!record) return failure('No such Gallery version.');
        const bytes = await readFile(
          path.join(galleryVersionDir(paths, family.id, version.id), record.previewFile),
        ).catch(() => null);
        return bytes ? image(bytes.toString('base64'), 'image/png', record.name) : failure('That Gallery preview is missing.');
      }
      if (params.action === 'feature') {
        await appendRequest(paths, { kind: 'gallery.feature', familyId: family.id, versionId: version.id });
        return text('Featured that version.');
      }
      if (params.action === 'open') {
        const record = normalizeGalleryVersion(
          await readJsonFile<unknown>(galleryVersionRecordFile(paths, family.id, version.id)),
        );
        if (!record) return failure('No such Gallery version.');
        await appendRequest(paths, { kind: 'gallery.open', familyId: family.id, versionId: version.id });
        return text('Opening the exact saved revision.', { designId: record.sourceDesignId });
      }
      if (params.action === 'duplicate') {
        const record = normalizeGalleryVersion(
          await readJsonFile<unknown>(galleryVersionRecordFile(paths, family.id, version.id)),
        );
        if (!record) return failure('No such Gallery version.');
        const designId = randomUUID();
        const newFamilyId = randomUUID();
        const variantId = randomUUID();
        const revisionId = randomUUID();
        await appendRequest(paths, {
          kind: 'gallery.duplicate',
          familyId: family.id,
          versionId: version.id,
          designId,
          newFamilyId,
          variantId,
          revisionId,
        });
        return text('Creating an exact editable Design copy in a new family.', { designId });
      }
      if (params.action === 'delete-version' || params.action === 'restore-version') {
        await appendRequest(paths, {
          kind: 'gallery.delete-version',
          familyId: family.id,
          versionId: version.id,
          deleted: params.action === 'delete-version',
        });
        return text(params.action === 'delete-version' ? 'Moved that version to Trash.' : 'Restored.');
      }
      await appendRequest(paths, {
        kind: 'gallery.purge-version',
        familyId: family.id,
        versionId: version.id,
      });
      return text('Permanently deleted that version.');
    },
  });
}
