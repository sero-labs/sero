import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DesignAsset } from '../shared/media';
import { DESIGN_SCHEMA_VERSION, type DesignRecord } from '../shared/design';
import type { DesignLibraryPaths } from '../shared/paths';
import { designAssetDir, galleryVersionDir, revisionDir } from '../shared/paths';
import { TWEAK_MANIFEST_FILE } from '../shared/tweaks';
import { buildPreviewDocument, PREVIEW_DOCUMENT_FILE } from './build';
import { createDesignRecord } from './design-store';
import { readGalleryVersion } from './gallery-store';

export interface DuplicateGalleryInput {
  familyId: string;
  versionId: string;
  designId: string;
  newFamilyId: string;
  variantId: string;
  revisionId: string;
}

export async function duplicateGalleryVersion(
  paths: DesignLibraryPaths,
  input: DuplicateGalleryInput,
): Promise<DesignRecord> {
  const version = await readGalleryVersion(paths, input.familyId, input.versionId);
  if (!version) throw new Error('That Gallery version is no longer available.');
  const versionDir = galleryVersionDir(paths, input.familyId, input.versionId);
  const destination = revisionDir(paths, input.designId, input.variantId, input.revisionId);
  const tweakManifest = version.tweakManifest === undefined
    ? undefined
    : { ...version.tweakManifest, variantRevisionId: input.revisionId };
  await mkdir(destination, { recursive: true });

  const emitted = await Promise.all(version.files.map(async (file) => {
    const content = await readFile(path.join(versionDir, 'source', file.name), 'utf8');
    await writeFile(path.join(destination, file.name), content, 'utf8');
    return { name: file.name, content };
  }));
  const assets: DesignAsset[] = await Promise.all(version.assets.map(async (asset) => {
    const file = 'snapshot.image';
    const assetDir = designAssetDir(paths, input.designId, asset.id);
    const [bytes] = await Promise.all([
      readFile(path.join(versionDir, asset.file)),
      mkdir(assetDir, { recursive: true }),
    ]);
    await writeFile(path.join(assetDir, file), bytes);
    return {
      id: asset.id,
      kind: 'image',
      reference: asset.reference,
      request: asset.request,
      attempts: [{
        id: `snapshot-${input.revisionId}`,
        outcome: 'ready',
        startedAt: version.createdAt,
        completedAt: version.createdAt,
        file,
        mediaType: asset.mediaType,
        bytes: asset.bytes,
        ...(asset.provenance === undefined ? {} : { provenance: asset.provenance }),
      }],
      createdAt: version.createdAt,
      updatedAt: version.createdAt,
    };
  }));
  const built = await buildPreviewDocument(version.target, emitted, {
    tweakVariables: tweakManifest?.controls.map((control) => control.cssVariable) ?? [],
    assets: await Promise.all(version.assets.map(async (asset) => ({
      reference: asset.reference,
      bytes: await readFile(path.join(versionDir, asset.file)),
      mediaType: asset.mediaType,
    }))),
  });
  if (!built.document) throw new Error('The saved source could not be rebuilt.');
  await writeFile(path.join(destination, PREVIEW_DOCUMENT_FILE), built.document, 'utf8');
  if (tweakManifest) {
    await writeFile(
      path.join(destination, TWEAK_MANIFEST_FILE),
      JSON.stringify({ manifest: tweakManifest, dropped: [] }, null, 2),
      'utf8',
    );
  }

  const createdAt = Date.now();
  const design: DesignRecord = {
    id: input.designId,
    schemaVersion: DESIGN_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    title: `${version.title} copy`,
    brief: version.brief,
    references: version.references.map(({ itemId, order, tombstone }) => ({
      itemId, order, ...(tombstone === undefined ? {} : { tombstone }),
    })),
    variants: [{
      id: input.variantId,
      index: 0,
      status: 'ready',
      attempts: 1,
      visibleRevisionId: input.revisionId,
      revisions: [{
        id: input.revisionId,
        createdAt,
        jobId: version.sourceJobId,
        ...(version.model === undefined ? {} : { model: version.model }),
        files: version.files,
        builtFile: PREVIEW_DOCUMENT_FILE,
        buildWarnings: built.warnings,
        ...(tweakManifest === undefined ? {} : { tweakManifestFile: TWEAK_MANIFEST_FILE }),
        tweaks: { overrides: version.tweakOverrides, checkpoints: [] },
        summary: version.summary,
        name: version.name,
      }],
    }],
    appliedGuardrails: version.guardrails,
    assets,
    galleryFamilyId: input.newFamilyId,
    galleryLineage: {
      mode: 'duplicate',
      parentFamilyId: input.familyId,
      parentVersionId: input.versionId,
    },
  };
  return (await createDesignRecord(paths, design)).design;
}
