import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { GalleryFamilyRecord, GalleryVersionRecord } from '../shared/gallery';
import { normalizeGalleryFamily, normalizeGalleryVersion } from '../shared/gallery';
import type { DesignLibraryPaths } from '../shared/paths';
import {
  galleryFamilyDir,
  galleryFamilyRecordFile,
  galleryVersionDir,
  galleryVersionRecordFile,
  isSafeId,
} from '../shared/paths';
import { bumpControlRevision, replaceIndex, updateIndex } from '../shared/index-storage';
import { withIndexRepair } from '../shared/index-repair';
import { normalizeGalleryIndex } from '../shared/indexes';
import { readJsonFile, withRecordLock, writeJsonFile } from '../shared/state-io';
import { mutateDesign } from './design-store';

export async function readGalleryFamily(
  paths: DesignLibraryPaths,
  familyId: string,
): Promise<GalleryFamilyRecord | null> {
  return normalizeGalleryFamily(await readJsonFile<unknown>(galleryFamilyRecordFile(paths, familyId)));
}

export async function readGalleryVersion(
  paths: DesignLibraryPaths,
  familyId: string,
  versionId: string,
): Promise<GalleryVersionRecord | null> {
  return normalizeGalleryVersion(
    await readJsonFile<unknown>(galleryVersionRecordFile(paths, familyId, versionId)),
  );
}

async function publishFamily(paths: DesignLibraryPaths, family: GalleryFamilyRecord): Promise<void> {
  await withIndexRepair(paths, 'gallery', family.id, async () => {
    await writeJsonFile(galleryFamilyRecordFile(paths, family.id), family);
    await updateIndex(paths, paths.galleryIndexFile, normalizeGalleryIndex, family.id, family);
    await bumpControlRevision(paths);
  });
}

export async function mutateGalleryFamily(
  paths: DesignLibraryPaths,
  familyId: string,
  mutate: (family: GalleryFamilyRecord | null) => GalleryFamilyRecord | null,
): Promise<GalleryFamilyRecord | null> {
  const file = galleryFamilyRecordFile(paths, familyId);
  return withRecordLock(paths, file, async () => {
    const next = mutate(await readGalleryFamily(paths, familyId));
    if (next === null) return null;
    const committed = { ...next, updatedAt: Date.now() };
    await publishFamily(paths, committed);
    return committed;
  });
}

export interface GalleryScan {
  families: GalleryFamilyRecord[];
  unreadable: string[];
}

export async function scanGalleryFamilies(paths: DesignLibraryPaths): Promise<GalleryScan> {
  const entries = await readdir(paths.galleryDir, { withFileTypes: true }).catch(() => []);
  const families: GalleryFamilyRecord[] = [];
  const unreadable: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeId(entry.name)) continue;
    const family = await readGalleryFamily(paths, entry.name);
    if (family) families.push(family);
    else unreadable.push(entry.name);
  }
  return { families, unreadable };
}

export async function reindexGallery(paths: DesignLibraryPaths, notify = true): Promise<string[]> {
  const { families: galleryFamilies, unreadable } = await scanGalleryFamilies(paths);
  await replaceIndex(paths, paths.galleryIndexFile, normalizeGalleryIndex, galleryFamilies);
  if (notify) await bumpControlRevision(paths);
  return unreadable;
}

/** Remove transaction directories that were never atomically renamed into versions. */
export async function pruneGalleryTemps(paths: DesignLibraryPaths): Promise<number> {
  const families = await readdir(paths.galleryDir, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const family of families) {
    if (!family.isDirectory() || !isSafeId(family.name)) continue;
    const versionsDir = path.join(galleryFamilyDir(paths, family.name), 'versions');
    const versions = await readdir(versionsDir, { withFileTypes: true }).catch(() => []);
    for (const version of versions) {
      if (!version.isDirectory() || !version.name.endsWith('.tmp')) continue;
      await rm(path.join(versionsDir, version.name), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

export async function purgeGalleryVersion(
  paths: DesignLibraryPaths,
  familyId: string,
  versionId: string,
): Promise<void> {
  const current = await readGalleryFamily(paths, familyId);
  if (current?.versions.length === 1 && current.versions[0]?.id === versionId) {
    await purgeGalleryFamily(paths, familyId);
    return;
  }
  const family = await mutateGalleryFamily(paths, familyId, (current) => {
    if (!current) return null;
    const versions = current.versions.filter((version) => version.id !== versionId);
    if (versions.length === 0) return current;
    const featuredVersionId = current.featuredVersionId === versionId
      ? versions.filter((version) => version.deletedAt === undefined).at(-1)?.id ?? versions.at(-1)!.id
      : current.featuredVersionId;
    return { ...current, versions, featuredVersionId };
  });
  if (!family || family.versions.some((version) => version.id === versionId)) return;
  await rm(galleryVersionDir(paths, familyId, versionId), { recursive: true, force: true });
}

export async function purgeGalleryFamily(
  paths: DesignLibraryPaths,
  familyId: string,
): Promise<void> {
  const family = await readGalleryFamily(paths, familyId);
  const file = galleryFamilyRecordFile(paths, familyId);
  await withRecordLock(paths, file, async () => {
    await withIndexRepair(paths, 'gallery', familyId, async () => {
      await rm(galleryFamilyDir(paths, familyId), { recursive: true, force: true });
      await updateIndex(paths, paths.galleryIndexFile, normalizeGalleryIndex, familyId, null);
      await bumpControlRevision(paths);
    });
  });
  if (family) {
    await mutateDesign(paths, family.sourceDesignId, (design) =>
      design.galleryFamilyId === familyId ? { ...design, galleryFamilyId: undefined } : null,
    );
  }
}
