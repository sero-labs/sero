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
import { readJsonFile, updateState, withRecordLock, writeJsonFile } from '../shared/state-io';
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
  await writeJsonFile(galleryFamilyRecordFile(paths, family.id), family);
  await updateState(paths, (state) => ({
    ...state,
    galleryFamilies: [
      ...state.galleryFamilies.filter((entry) => entry.id !== family.id),
      family,
    ],
  }));
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

export async function scanGalleryFamilies(paths: DesignLibraryPaths): Promise<GalleryFamilyRecord[]> {
  const entries = await readdir(paths.galleryDir, { withFileTypes: true }).catch(() => []);
  const families = await Promise.all(
    entries.flatMap((entry) =>
      entry.isDirectory() && isSafeId(entry.name) ? [readGalleryFamily(paths, entry.name)] : [],
    ),
  );
  return families.filter((family): family is GalleryFamilyRecord => family !== null);
}

export async function reindexGallery(paths: DesignLibraryPaths): Promise<void> {
  const galleryFamilies = await scanGalleryFamilies(paths);
  await updateState(paths, (state) => ({ ...state, galleryFamilies }));
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
    await rm(galleryFamilyDir(paths, familyId), { recursive: true, force: true });
    await updateState(paths, (state) => ({
      ...state,
      galleryFamilies: state.galleryFamilies.filter((family) => family.id !== familyId),
    }));
  });
  if (family) {
    await mutateDesign(paths, family.sourceDesignId, (design) =>
      design.galleryFamilyId === familyId ? { ...design, galleryFamilyId: undefined } : null,
    );
  }
}
