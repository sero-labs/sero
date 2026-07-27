import type { DesignBrief, DesignRecord } from '../shared/design';
import { emptyAnalysis, setOverride } from '../shared/librarian';
import type { DesignLibraryPaths } from '../shared/paths';
import type { ItemRecord } from '../shared/records';
import { ITEM_SCHEMA_VERSION } from '../shared/records';
import { createDesign } from './designs';
import { saveItem } from './store';

/** Record fixtures shared by the runtime tests. Never imported by the runtime. */

export interface SeedItemOptions {
  status?: ItemRecord['analysis']['status'];
  always?: string[];
  never?: string[];
  deleted?: boolean;
}

export async function seedItem(
  paths: DesignLibraryPaths,
  id: string,
  options: SeedItemOptions = {},
): Promise<ItemRecord> {
  const now = Date.now();
  let profile = { generated: emptyAnalysis(id), overrides: {} };
  if (options.always) profile = setOverride(profile, 'always', options.always, now);
  if (options.never) profile = setOverride(profile, 'never', options.never, now);

  const item: ItemRecord = {
    id,
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: 'image',
    source: { kind: 'file', fileName: `${id}.png` },
    asset: {
      originalFile: 'original.png',
      previewFile: 'preview.webp',
      mediaType: 'image/png',
      bytes: 10,
      checksum: `checksum-${id}`,
    },
    profile,
    analysis: { status: options.status ?? 'pending', attempts: 0 },
    favourite: false,
    collectionIds: [],
    ...(options.deleted === true ? { deletedAt: now } : {}),
  };
  await saveItem(paths, item);
  return item;
}

export const TEST_BRIEF: DesignBrief = {
  request: 'A dense operational dashboard',
  target: 'html',
  variationMode: 'blend',
  variantCount: 3,
  inspirationStrength: 'balanced',
};

/** A Design with `variantCount` pending variants, over one ready reference. */
export async function seedDesign(
  paths: DesignLibraryPaths,
  designId: string,
  brief: Partial<DesignBrief> = {},
): Promise<DesignRecord> {
  const referenceId = `${designId}-ref`;
  await seedItem(paths, referenceId, { status: 'ready' });
  const outcome = await createDesign(paths, {
    designId,
    title: designId,
    brief: { ...TEST_BRIEF, ...brief },
    referenceItemIds: [referenceId],
    resolutions: [],
  });
  if (outcome.status !== 'created') throw new Error(`seedDesign failed: ${outcome.reason}`);
  return outcome.design;
}
