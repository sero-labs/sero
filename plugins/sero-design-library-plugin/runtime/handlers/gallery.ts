/**
 * Gallery snapshots, families and export.
 *
 * A version is immutable: saving copies exact code with effective tweak values
 * resolved, its own copies of every used asset, the manifest, the values and
 * the provenance. Nothing that happens to a Design or a Library item
 * afterwards can change it.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  designAssetsRoot,
  designRecordPath,
  familyDir,
  familyRecordPath,
  versionDir,
} from '../../shared/paths';
import { mutateRecord, publishJson, readJsonFile, readRecord } from '../../shared/state-io';
import { newId } from '../../shared/ids';
import { resolveTweakValues } from '../../shared/tweaks';
import { buildDeterministicPreviewDocument, buildStandaloneDocument } from '../../shared/preview-document';
import { resolveLibrarianField } from '../../shared/schemas';
import { APPROVED_DEPENDENCIES } from '../generation/prompt';
import type {
  DesignRecord,
  GalleryFamilyRecord,
  GalleryVersionSnapshot,
  LibraryItemRecord,
} from '../../shared/records';
import { itemRecordPath } from '../../shared/paths';
import type { RuntimeHost } from '../host';
import { checkpointTweaks, effectiveOverrides } from './design';

function fileContents(files: Array<{ path: string; contents: string }>, target: string): string {
  return files.find((file) => file.path === target)?.contents ?? '';
}

async function collectGuardrails(
  host: RuntimeHost,
  design: DesignRecord,
): Promise<{ always: string[]; never: string[] }> {
  const always: string[] = [];
  const never: string[] = [];
  for (const reference of design.references) {
    if (reference.source.kind !== 'live') continue;
    const item = await readRecord<LibraryItemRecord>(itemRecordPath(host.paths, reference.source.itemId));
    if (!item?.profile) continue;
    always.push(...resolveLibrarianField(item.profile, 'always'));
    never.push(...resolveLibrarianField(item.profile, 'never'));
  }
  return { always: [...new Set(always)], never: [...new Set(never)] };
}

export interface SaveVersionInput {
  designId: string;
  variantId: string;
  familyId?: string;
}

export async function saveGalleryVersion(
  host: RuntimeHost,
  input: SaveVersionInput,
): Promise<{ familyId: string; versionId: string }> {
  // A pending tweak session becomes a revision first, so the snapshot always
  // corresponds to a real, recoverable Design revision.
  await checkpointTweaks(host, {
    designId: input.designId,
    variantId: input.variantId,
    reason: 'gallery-save',
  });

  const design = await readRecord<DesignRecord>(designRecordPath(host.paths, input.designId));
  if (!design) throw new Error(`Unknown Design ${input.designId}.`);
  const variant = design.variants.find((entry) => entry.id === input.variantId);
  const revision = variant?.revisions.find((entry) => entry.id === variant.visibleRevisionId);
  if (!variant || !revision) throw new Error('That variant has no visible revision to save.');

  const familyId = input.familyId ?? newId('fam', host.now());
  const versionId = newId('ver', host.now());
  const dir = versionDir(host.paths, familyId, versionId);
  await mkdir(path.join(dir, 'assets'), { recursive: true });

  const overrides = effectiveOverrides(variant);
  const values = resolveTweakValues(revision.tweakManifest, overrides);

  const usedAssets = design.assets.filter((asset) => revision.assetIds.includes(asset.id));
  const bundled: GalleryVersionSnapshot['assets'] = [];
  for (const asset of usedAssets) {
    const target = path.join(dir, 'assets', `${asset.id}-${asset.fileName}`);
    await copyFile(path.join(designAssetsRoot(host.paths, design.id), asset.id, asset.fileName), target)
      .catch(() => undefined);
    bundled.push({ id: asset.id, fileName: `${asset.id}-${asset.fileName}`, mimeType: asset.mimeType });
  }

  const previewAssets = await loadPreviewAssetsFromSnapshot(dir, bundled);

  const standalone = buildStandaloneDocument({
    title: variant.title,
    bodyHtml: fileContents(revision.files, 'body.html'),
    css: fileContents(revision.files, 'styles.css'),
    js: fileContents(revision.files, 'app.js'),
    assets: previewAssets,
    manifest: revision.tweakManifest,
    values,
  });

  const previewFileName = 'preview.html';
  await writeFile(
    path.join(dir, previewFileName),
    buildDeterministicPreviewDocument({
      title: variant.title,
      bodyHtml: fileContents(revision.files, 'body.html'),
      css: fileContents(revision.files, 'styles.css'),
      assets: previewAssets,
      manifest: revision.tweakManifest,
      values,
    }),
    'utf8',
  );
  await writeFile(path.join(dir, 'standalone.html'), standalone, 'utf8');

  const snapshot: GalleryVersionSnapshot = {
    id: versionId,
    familyId,
    title: variant.title,
    outputTarget: revision.outputTarget,
    sourceDesignId: design.id,
    sourceVariantId: variant.id,
    sourceRevisionId: revision.id,
    files: revision.files,
    tweakManifest: revision.tweakManifest,
    tweakValues: values,
    assets: bundled,
    previewFileName,
    request: design.request,
    guardrails: await collectGuardrails(host, design),
    references: design.references,
    provenance: {
      savedAt: host.now(),
      dependencies: revision.outputTarget === 'react-tailwind' ? [...APPROVED_DEPENDENCIES] : [],
    },
    createdAt: host.now(),
  };

  await publishJson(path.join(dir, 'version.json'), snapshot);

  await mutateRecord<GalleryFamilyRecord>(familyRecordPath(host.paths, familyId), (current) => {
    if (!current) {
      return {
        revision: 0,
        id: familyId,
        title: design.title,
        versionIds: [versionId],
        featuredVersionId: versionId,
        createdAt: host.now(),
        updatedAt: host.now(),
      };
    }
    return {
      ...current,
      versionIds: [...current.versionIds, versionId],
      featuredVersionId: versionId,
      updatedAt: host.now(),
    };
  });

  return { familyId, versionId };
}

async function loadPreviewAssetsFromSnapshot(
  dir: string,
  assets: GalleryVersionSnapshot['assets'],
): Promise<Array<{ path: string; mimeType: string; data: string }>> {
  const loaded: Array<{ path: string; mimeType: string; data: string }> = [];
  for (const asset of assets) {
    const bytes = await readFile(path.join(dir, 'assets', asset.fileName)).catch(() => null);
    if (!bytes) continue;
    // Snapshots keep the reference shape the generated code used.
    loaded.push({
      path: `assets/${asset.id}/${asset.fileName.slice(asset.id.length + 1)}`,
      mimeType: asset.mimeType,
      data: bytes.toString('base64'),
    });
  }
  return loaded;
}

export async function featureVersion(
  host: RuntimeHost,
  payload: { familyId: string; versionId: string },
): Promise<void> {
  await mutateRecord<GalleryFamilyRecord>(familyRecordPath(host.paths, payload.familyId), (current) => {
    if (!current) throw new Error(`Unknown Gallery family ${payload.familyId}.`);
    if (!current.versionIds.includes(payload.versionId)) {
      throw new Error('That version does not belong to this family.');
    }
    return { ...current, featuredVersionId: payload.versionId, updatedAt: host.now() };
  });
}

export async function setGalleryDeleted(
  host: RuntimeHost,
  payload: { familyId: string; versionId?: string },
  deleted: boolean,
): Promise<void> {
  if (payload.versionId) {
    const file = path.join(versionDir(host.paths, payload.familyId, payload.versionId), 'version.json');
    const snapshot = await readJsonFile<GalleryVersionSnapshot>(file);
    if (!snapshot) throw new Error(`Unknown Gallery version ${payload.versionId}.`);
    const next = { ...snapshot };
    if (deleted) next.deletedAt = host.now();
    else delete next.deletedAt;
    await publishJson(file, next);
    return;
  }

  await mutateRecord<GalleryFamilyRecord>(familyRecordPath(host.paths, payload.familyId), (current) => {
    if (!current) throw new Error(`Unknown Gallery family ${payload.familyId}.`);
    const next = { ...current, updatedAt: host.now() };
    if (deleted) return { ...next, deletedAt: host.now() };
    delete next.deletedAt;
    return next;
  });
}

/** Permanent deletion affects only the selected snapshot or family. */
export async function purgeGallery(
  host: RuntimeHost,
  payload: { familyId: string; versionId?: string },
): Promise<void> {
  if (!payload.versionId) {
    await rm(familyDir(host.paths, payload.familyId), { recursive: true, force: true });
    return;
  }

  await rm(versionDir(host.paths, payload.familyId, payload.versionId), { recursive: true, force: true });
  await mutateRecord<GalleryFamilyRecord>(familyRecordPath(host.paths, payload.familyId), (current) => {
    if (!current) throw new Error(`Unknown Gallery family ${payload.familyId}.`);
    const versionIds = current.versionIds.filter((id) => id !== payload.versionId);
    return {
      ...current,
      versionIds,
      featuredVersionId: versionIds.includes(current.featuredVersionId)
        ? current.featuredVersionId
        : versionIds[versionIds.length - 1] ?? current.featuredVersionId,
      updatedAt: host.now(),
    };
  });
}

/** Duplicate creates a new linked family holding a copy of the chosen version. */
export async function duplicateFamily(
  host: RuntimeHost,
  payload: { familyId: string; versionId: string; newFamilyId: string },
): Promise<void> {
  const sourceDir = versionDir(host.paths, payload.familyId, payload.versionId);
  const snapshot = await readJsonFile<GalleryVersionSnapshot>(path.join(sourceDir, 'version.json'));
  if (!snapshot) throw new Error(`Unknown Gallery version ${payload.versionId}.`);

  const versionId = newId('ver', host.now());
  const targetDir = versionDir(host.paths, payload.newFamilyId, versionId);
  await mkdir(path.join(targetDir, 'assets'), { recursive: true });

  for (const asset of snapshot.assets) {
    await copyFile(
      path.join(sourceDir, 'assets', asset.fileName),
      path.join(targetDir, 'assets', asset.fileName),
    ).catch(() => undefined);
  }
  for (const name of [snapshot.previewFileName, 'standalone.html']) {
    await copyFile(path.join(sourceDir, name), path.join(targetDir, name)).catch(() => undefined);
  }

  await publishJson(path.join(targetDir, 'version.json'), {
    ...snapshot,
    id: versionId,
    familyId: payload.newFamilyId,
    createdAt: host.now(),
  });

  await mutateRecord<GalleryFamilyRecord>(familyRecordPath(host.paths, payload.newFamilyId), () => ({
    revision: 0,
    id: payload.newFamilyId,
    title: `${snapshot.title} copy`,
    versionIds: [versionId],
    featuredVersionId: versionId,
    linkedSourceFamilyId: payload.familyId,
    createdAt: host.now(),
    updatedAt: host.now(),
  }));
}

/**
 * Reopen restores the source Design at the exact saved revision. The snapshot
 * is never edited — subsequent work creates new Design revisions.
 */
export async function reopenVersion(
  host: RuntimeHost,
  payload: { familyId: string; versionId: string; designId: string },
): Promise<string> {
  const snapshot = await readJsonFile<GalleryVersionSnapshot>(
    path.join(versionDir(host.paths, payload.familyId, payload.versionId), 'version.json'),
  );
  if (!snapshot) throw new Error(`Unknown Gallery version ${payload.versionId}.`);

  const existing = await readRecord<DesignRecord>(
    designRecordPath(host.paths, snapshot.sourceDesignId),
  );
  if (existing) {
    await mutateRecord<DesignRecord>(designRecordPath(host.paths, snapshot.sourceDesignId), (current) => {
      if (!current) throw new Error('Unknown Design.');
      const next = {
        ...current,
        variants: current.variants.map((variant) =>
          variant.id === snapshot.sourceVariantId
            && variant.revisions.some((entry) => entry.id === snapshot.sourceRevisionId)
            ? { ...variant, visibleRevisionId: snapshot.sourceRevisionId }
            : variant),
        reopenedFromVersionId: snapshot.id,
        updatedAt: host.now(),
      };
      delete next.deletedAt;
      return next;
    });
    return snapshot.sourceDesignId;
  }

  // The source Design was permanently deleted: rebuild one from the snapshot
  // so the saved work stays editable without ever mutating the snapshot.
  const variantId = newId('var', host.now());
  const revisionId = newId('rev', host.now());
  await mutateRecord<DesignRecord>(designRecordPath(host.paths, payload.designId), () => ({
    revision: 0,
    id: payload.designId,
    title: snapshot.title,
    request: snapshot.request,
    outputTarget: snapshot.outputTarget,
    references: snapshot.references,
    variants: [{
      id: variantId,
      title: snapshot.title,
      status: 'succeeded',
      visibleRevisionId: revisionId,
      revisions: [{
        id: revisionId,
        variantId,
        revisionNumber: 1,
        outputTarget: snapshot.outputTarget,
        files: snapshot.files,
        assetIds: [],
        tweakManifest: snapshot.tweakManifest,
        tweakOverrides: snapshot.tweakValues,
        droppedTweakControls: [],
        createdAt: host.now(),
        createdReason: 'generated',
      }],
    }],
    assets: [],
    conflicts: [],
    createdAt: host.now(),
    updatedAt: host.now(),
    reopenedFromVersionId: snapshot.id,
  }));
  return payload.designId;
}
