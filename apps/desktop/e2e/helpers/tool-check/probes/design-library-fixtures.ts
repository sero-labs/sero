/**
 * What a Design Library probe needs before its first step: an analysed
 * reference, a generated Design, a saved Gallery version. Each is built
 * through the plugin's own tools and the stub model, from a step's `setup`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { StepContext } from '../types';
import {
  importReference, invoke, libraryHome, makePng, poll, rand, readDesign, readJsonFile,
  uploadImage, waitForAnalysis, type ImportedItem,
} from './design-library-support';

/** A reference analysed by the stub Librarian. */
export async function analysedReference(ctx: StepContext, label: string): Promise<ImportedItem> {
  const item = await importReference(ctx, label);
  await waitForAnalysis(ctx, item.id, 'ready');
  return item;
}

/**
 * Makes an imported item count as artwork the plugin made itself (source
 * `generated` with a provenance block). A Design made from such an item copies
 * it into its tray as a ready asset, which is the one way to get a tray asset
 * without calling the paid media provider (runtime/reference-assets.ts).
 */
export async function markAsPluginArtwork(ctx: StepContext, itemId: string): Promise<void> {
  const file = path.join(await libraryHome(ctx), 'items', itemId, 'record.json');
  const record = readJsonFile(file) as { source: Record<string, unknown> } | null;
  if (!record) throw new Error(`no record for item ${itemId}`);
  const now = Date.now();
  fs.writeFileSync(file, JSON.stringify({
    ...record,
    source: { ...record.source, kind: 'generated' },
    generation: {
      providerId: 'tool-check',
      capability: 'text-to-image',
      model: 'tool-check/image',
      prompt: 'probe artwork',
      parameters: {},
      startedAt: now,
      completedAt: now,
    },
  }, null, 2));
}

export interface ReadyDesign {
  designId: string;
  variantId: string;
  revisionId: string;
  title: string;
  /** The tray assets the Design copied from plugin artwork, in reference order. */
  assetIds: string[];
  /** The artwork references, in the order they were given. */
  artwork: ImportedItem[];
}

/**
 * A generated Design with one variant, ready. `artwork` is how many of its
 * references are plugin artwork, each of which becomes a tray asset.
 */
export async function createReadyDesign(ctx: StepContext, options: { artwork?: number } = {}): Promise<ReadyDesign> {
  const plain = await analysedReference(ctx, 'probe-ref');
  const artwork: ImportedItem[] = [];
  for (let index = 0; index < (options.artwork ?? 0); index += 1) {
    const item = await analysedReference(ctx, 'probe-art');
    await markAsPluginArtwork(ctx, item.id);
    artwork.push(item);
  }
  const title = `Probe design ${rand()}`;
  const created = await invoke(ctx, 'design_library_designs', {
    action: 'create',
    referenceItemIds: [plain.id, ...artwork.map((item) => item.id)],
    request: 'A dense operational dashboard',
    title,
    variantCount: 1,
    target: 'html',
  });
  if (!created.text.startsWith('Queued a html Design')) throw new Error(`create failed: ${created.text}`);
  const designId = await poll(ctx, `the design ${title}`, async () => {
    const listed = await invoke(ctx, 'design_library_designs', { action: 'list' });
    const designs = (listed.details as { designs?: Array<{ id: string; title: string }> } | null)?.designs ?? [];
    return designs.find((design) => design.title === title)?.id ?? null;
  });
  const ready = await poll(ctx, `${title} to be ready`, async () => {
    const design = await readDesign(ctx, designId);
    const variant = design?.variants[0];
    if (variant?.status === 'failed') throw new Error(`generation failed: ${JSON.stringify(variant)}`);
    return design && variant?.status === 'ready' && variant.revisions[0]?.builtFile ? design : null;
  }, 90_000);
  const variant = ready.variants[0]!;
  return {
    designId,
    variantId: variant.id,
    revisionId: variant.revisions[0]!.id,
    title,
    assetIds: artwork.map((item) => ready.assets.find((asset) => asset.sourceItemId === item.id)?.id ?? ''),
    artwork,
  };
}

export interface GalleryVersionView {
  id: string;
  deletedAt?: number;
}

export interface GalleryFamilyView {
  id: string;
  title: string;
  sourceDesignId: string;
  featuredVersionId: string;
  favourite: boolean;
  deletedAt?: number;
  versions: GalleryVersionView[];
}

export async function galleryFamilies(ctx: StepContext): Promise<GalleryFamilyView[]> {
  const listed = await invoke(ctx, 'design_library_gallery', { action: 'list', includeDeleted: true });
  return (listed.details as { families?: GalleryFamilyView[] } | null)?.families ?? [];
}

/** Stages the PNG a Gallery save needs next to the design: its preview picture. */
export async function stagePreview(ctx: StepContext, png: Buffer = makePng()): Promise<{ uploadId: string; png: Buffer }> {
  const uploadId = await uploadImage(ctx, { fileName: 'gallery-preview.png', png, purpose: 'gallery-preview' });
  return { uploadId, png };
}

/** Saves the design's revision to the Gallery and waits for the version to land. */
export async function saveToGallery(
  ctx: StepContext,
  design: ReadyDesign,
  expectedVersions: number,
): Promise<{ family: GalleryFamilyView; preview: Buffer }> {
  const { uploadId, png } = await stagePreview(ctx);
  const saved = await invoke(ctx, 'design_library_gallery', {
    action: 'save',
    designId: design.designId,
    variantId: design.variantId,
    revisionId: design.revisionId,
    previewUploadId: uploadId,
  });
  if (!saved.text.startsWith('Saving this exact revision')) throw new Error(`save failed: ${saved.text}`);
  const family = await poll(ctx, `${expectedVersions} gallery version(s) of ${design.designId}`, async () => {
    const found = (await galleryFamilies(ctx)).find((entry) => entry.sourceDesignId === design.designId);
    return found && found.versions.length >= expectedVersions ? found : null;
  });
  return { family, preview: png };
}
