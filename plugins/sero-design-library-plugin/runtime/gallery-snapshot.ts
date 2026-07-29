import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  GalleryFamilyRecord,
  GalleryReferenceSnapshot,
  GallerySnapshotAsset,
  GallerySnapshotFile,
  GalleryVersionRecord,
} from '../shared/gallery';
import { GALLERY_SCHEMA_VERSION } from '../shared/gallery';
import { effectiveAnalysis } from '../shared/librarian';
import { currentAttempt } from '../shared/media';
import type { DesignLibraryPaths } from '../shared/paths';
import {
  designAssetDir,
  galleryVersionDir,
  itemRecordFile,
  revisionDir,
} from '../shared/paths';
import { normalizeItemRecord } from '../shared/records';
import { readJsonFile, writeJsonFile } from '../shared/state-io';
import { TARGET_CONTRACTS } from '../shared/targets';
import {
  effectiveTweakValue,
  normalizeTweakDocument,
  tweakCssBlock,
  tweakValueToCss,
} from '../shared/tweaks';
import { assembleUpload, discardUpload, readUploadManifest } from '../shared/uploads';
import { mutateDesign, readDesign } from './design-store';
import { mutateGalleryFamily, readGalleryFamily, readGalleryVersion } from './gallery-store';

export interface SaveGalleryInput {
  familyId: string;
  versionId: string;
  designId: string;
  variantId: string;
  revisionId: string;
  previewUploadId: string;
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function copySourceFiles(
  sourceDir: string,
  destinationDir: string,
  names: string[],
): Promise<{ files: GallerySnapshotFile[]; content: string }> {
  await mkdir(destinationDir, { recursive: true });
  const copied = await Promise.all(names.map(async (name) => {
    const bytes = await readFile(path.join(sourceDir, name));
    await writeFile(path.join(destinationDir, name), bytes);
    return { name, bytes: bytes.byteLength, checksum: checksum(bytes), content: bytes.toString('utf8') };
  }));
  return {
    files: copied.map(({ content: _content, ...file }) => file),
    content: copied.map((file) => file.content).join('\n'),
  };
}

async function copyReferencedAssets(
  paths: DesignLibraryPaths,
  designId: string,
  content: string,
  destinationDir: string,
): Promise<GallerySnapshotAsset[]> {
  const design = await readDesign(paths, designId);
  if (!design) return [];
  const assets: GallerySnapshotAsset[] = [];
  for (const asset of design.assets) {
    if (!content.includes(asset.reference)) continue;
    const attempt = currentAttempt(asset);
    if (attempt?.outcome !== 'ready' || attempt.file === undefined) continue;
    const name = asset.reference.replace(/^assets\//, '');
    const source = path.join(designAssetDir(paths, designId, asset.id), attempt.file);
    const bytes = await readFile(source);
    await mkdir(destinationDir, { recursive: true });
    await copyFile(source, path.join(destinationDir, name));
    assets.push({
      id: asset.id,
      reference: asset.reference,
      file: `assets/${name}`,
      mediaType: attempt.mediaType ?? 'application/octet-stream',
      bytes: bytes.byteLength,
      checksum: checksum(bytes),
      request: asset.request,
      ...(attempt.provenance === undefined ? {} : { provenance: attempt.provenance }),
    });
  }
  return assets;
}

async function referenceSnapshots(
  paths: DesignLibraryPaths,
  references: Array<{ itemId: string; order: number; tombstone?: GalleryReferenceSnapshot['tombstone'] }>,
): Promise<GalleryReferenceSnapshot[]> {
  return Promise.all(references.map(async (reference) => {
    const item = normalizeItemRecord(await readJsonFile<unknown>(itemRecordFile(paths, reference.itemId)));
    const title = item ? effectiveAnalysis(item.profile).title : reference.tombstone?.title ?? reference.itemId;
    return { ...reference, title };
  }));
}

function effectiveValues(
  manifest: ReturnType<typeof normalizeTweakDocument>['manifest'],
  overrides: Record<string, string | number | boolean>,
): Record<string, string> {
  return Object.fromEntries(manifest.controls.map((definition) => {
    const value = effectiveTweakValue(definition, overrides);
    return [definition.cssVariable, tweakValueToCss(definition.control, value)];
  }));
}

async function buildVersion(
  paths: DesignLibraryPaths,
  input: SaveGalleryInput,
  temporaryDir: string,
): Promise<GalleryVersionRecord> {
  const design = await readDesign(paths, input.designId);
  const variant = design?.variants.find((entry) => entry.id === input.variantId);
  const revision = variant?.revisions.find((entry) => entry.id === input.revisionId);
  if (!design || !variant || !revision) throw new Error('That Design revision is no longer available.');
  if (design.galleryFamilyId !== undefined && design.galleryFamilyId !== input.familyId) {
    throw new Error('That Design is linked to another Gallery family.');
  }
  if (revision.builtFile === undefined) throw new Error('That Design revision has no preview to save.');

  const [upload, preview] = await Promise.all([
    readUploadManifest(paths, input.previewUploadId),
    assembleUpload(paths, input.previewUploadId, 'original'),
  ]);
  if (!upload?.complete || !preview || upload.mediaType !== 'image/png') {
    throw new Error('The Gallery preview upload is incomplete or is not a PNG.');
  }

  await mkdir(temporaryDir, { recursive: true });
  const sourceDir = revisionDir(paths, design.id, variant.id, revision.id);
  const copied = await copySourceFiles(sourceDir, path.join(temporaryDir, 'source'), revision.files.map((file) => file.name));
  const manifestDocument = revision.tweakManifestFile
    ? normalizeTweakDocument(await readJsonFile<unknown>(path.join(sourceDir, revision.tweakManifestFile)))
    : normalizeTweakDocument(null);
  const overrides = revision.tweaks?.overrides ?? {};
  const tweakCss = tweakCssBlock(manifestDocument.manifest, overrides);
  const effectiveTweaksFile = tweakCss === '' ? undefined : 'effective-tweaks.css';
  if (effectiveTweaksFile) {
    await writeFile(path.join(temporaryDir, effectiveTweaksFile), tweakCss, 'utf8');
  }

  const assets = await copyReferencedAssets(
    paths,
    design.id,
    copied.content,
    path.join(temporaryDir, 'assets'),
  );
  const previewFile = 'preview.png';
  await writeFile(path.join(temporaryDir, previewFile), preview);

  const record: GalleryVersionRecord = {
    id: input.versionId,
    schemaVersion: GALLERY_SCHEMA_VERSION,
    familyId: input.familyId,
    createdAt: Date.now(),
    title: design.title,
    name: revision.name || design.title,
    summary: revision.summary,
    target: design.brief.target,
    sourceDesignId: design.id,
    sourceVariantId: variant.id,
    sourceRevisionId: revision.id,
    sourceJobId: revision.jobId,
    ...(revision.model === undefined ? {} : { model: revision.model }),
    files: copied.files,
    assets,
    previewFile,
    previewBytes: preview.byteLength,
    previewChecksum: checksum(preview),
    brief: design.brief,
    guardrails: design.appliedGuardrails,
    references: await referenceSnapshots(paths, design.references),
    tweakManifest: manifestDocument.manifest,
    ...(effectiveTweaksFile === undefined ? {} : { effectiveTweaksFile }),
    tweakOverrides: overrides,
    effectiveTweakValues: effectiveValues(manifestDocument.manifest, overrides),
    dependencyManifest: [...TARGET_CONTRACTS[design.brief.target].approvedImports],
  };
  await writeJsonFile(path.join(temporaryDir, 'record.json'), record);
  return record;
}

async function linkVersion(
  paths: DesignLibraryPaths,
  input: SaveGalleryInput,
  version: GalleryVersionRecord,
): Promise<void> {
  const linked = await mutateDesign(paths, input.designId, (design) => {
    if (design.galleryFamilyId !== undefined && design.galleryFamilyId !== input.familyId) {
      throw new Error('That Design is linked to another Gallery family.');
    }
    return { ...design, galleryFamilyId: input.familyId };
  });
  if (!linked) throw new Error('The source Design disappeared while it was being saved.');
  await mutateGalleryFamily(paths, input.familyId, (family): GalleryFamilyRecord => {
    if (family && family.sourceDesignId !== input.designId) {
      throw new Error('That Gallery family belongs to another Design.');
    }
    const pointer = {
      id: version.id,
      createdAt: version.createdAt,
      title: version.name,
      target: version.target,
      sourceVariantId: version.sourceVariantId,
      sourceRevisionId: version.sourceRevisionId,
      previewFile: version.previewFile,
    };
    if (family) {
      const versions = family.versions.some((entry) => entry.id === pointer.id)
        ? family.versions
        : [...family.versions, pointer];
      return { ...family, title: version.title, versions, featuredVersionId: pointer.id };
    }
    return {
      id: input.familyId,
      schemaVersion: GALLERY_SCHEMA_VERSION,
      createdAt: version.createdAt,
      updatedAt: version.createdAt,
      title: version.title,
      sourceDesignId: input.designId,
      featuredVersionId: version.id,
      versions: [pointer],
      favourite: false,
    };
  });
}

export async function saveGalleryVersion(
  paths: DesignLibraryPaths,
  input: SaveGalleryInput,
): Promise<GalleryVersionRecord> {
  const existing = await readGalleryVersion(paths, input.familyId, input.versionId);
  if (existing) {
    await linkVersion(paths, input, existing);
    await discardUpload(paths, input.previewUploadId);
    return existing;
  }
  const family = await readGalleryFamily(paths, input.familyId);
  if (family && family.sourceDesignId !== input.designId) {
    throw new Error('That Gallery family belongs to another Design.');
  }

  const destination = galleryVersionDir(paths, input.familyId, input.versionId);
  const temporary = `${destination}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  const version = await buildVersion(paths, input, temporary).catch(async (error: unknown) => {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  });
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(temporary, destination);

  await linkVersion(paths, input, version).catch(async (error: unknown) => {
    await rm(destination, { recursive: true, force: true });
    throw error;
  });
  await discardUpload(paths, input.previewUploadId);
  return version;
}
