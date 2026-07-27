/**
 * Index projection.
 *
 * The reactive index is a pure projection of the records on disk. Rebuilding
 * it from the records is what makes an interrupted index write recoverable:
 * the records are the truth, the index is a cache the runtime republishes.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { readJsonFile } from '../shared/state-io';
import {
  designRecordPath,
  familyRecordPath,
  itemRecordPath,
  type StoragePaths,
} from '../shared/paths';
import { resolveLibrarianField } from '../shared/schemas';
import type {
  DesignRecord,
  GalleryFamilyRecord,
  GalleryVersionSnapshot,
  LibraryItemRecord,
} from '../shared/records';
import type { DesignSummary, GalleryFamilySummary } from '../shared/state';
import type { LibraryItemSummary } from '../shared/types';

async function listDirs(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/** Flattened user-visible analysis so keyword search never reads a record. */
export function itemSearchText(record: LibraryItemRecord): string {
  if (!record.profile) return record.originalFileName;
  const field = <K extends Parameters<typeof resolveLibrarianField>[1]>(key: K) =>
    resolveLibrarianField(record.profile as NonNullable<typeof record.profile>, key);
  const visual = field('visualProfile');
  return [
    field('title'),
    field('notes'),
    field('primaryStyle'),
    field('summary'),
    field('designIntent'),
    field('designTypes').join(' '),
    field('tags').join(' '),
    field('aestheticVocabulary').map((entry) => `${entry.term} ${entry.meaning ?? ''}`).join(' '),
    field('always').join(' '),
    field('never').join(' '),
    field('generationPrompt'),
    Object.values(visual).flat().join(' '),
    record.originalFileName,
  ].join(' ');
}

export function toItemSummary(record: LibraryItemRecord): LibraryItemSummary {
  const profile = record.profile;
  const title = profile ? resolveLibrarianField(profile, 'title') : record.originalFileName;
  const primaryStyle = profile ? resolveLibrarianField(profile, 'primaryStyle') : '';
  const tags = profile ? resolveLibrarianField(profile, 'tags') : [];
  const palette = profile ? resolveLibrarianField(profile, 'palette') ?? [] : [];

  return {
    id: record.id,
    title,
    primaryStyle,
    tags,
    source: record.source,
    colours: palette.map((entry) => entry.hex),
    analysisStatus: record.analysisStatus,
    createdAt: record.createdAt,
    ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
    searchText: itemSearchText(record),
    checksum: record.original.checksum,
    ...(record.analysisError !== undefined ? { analysisError: record.analysisError } : {}),
  };
}

export function toDesignSummary(record: DesignRecord): DesignSummary {
  return {
    id: record.id,
    title: record.title,
    request: record.request,
    outputTarget: record.outputTarget,
    referenceCount: record.references.length,
    variantCount: record.variants.length,
    readyVariantCount: record.variants.filter((variant) => variant.visibleRevisionId !== undefined).length,
    updatedAt: record.updatedAt,
    ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
  };
}

export async function projectItems(paths: StoragePaths): Promise<LibraryItemSummary[]> {
  const ids = await listDirs(paths.items);
  const summaries: LibraryItemSummary[] = [];
  for (const id of ids) {
    const record = await readJsonFile<LibraryItemRecord>(itemRecordPath(paths, id));
    if (record) summaries.push(toItemSummary(record));
  }
  return summaries.sort((left, right) => right.createdAt - left.createdAt);
}

export async function projectDesigns(paths: StoragePaths): Promise<DesignSummary[]> {
  const ids = await listDirs(paths.designs);
  const summaries: DesignSummary[] = [];
  for (const id of ids) {
    const record = await readJsonFile<DesignRecord>(designRecordPath(paths, id));
    if (record) summaries.push(toDesignSummary(record));
  }
  return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function projectFamilies(paths: StoragePaths): Promise<GalleryFamilySummary[]> {
  const ids = await listDirs(paths.gallery);
  const summaries: GalleryFamilySummary[] = [];

  for (const id of ids) {
    const family = await readJsonFile<GalleryFamilyRecord>(familyRecordPath(paths, id));
    if (!family) continue;

    const versions = [];
    for (const versionId of family.versionIds) {
      const snapshot = await readJsonFile<GalleryVersionSnapshot>(
        path.join(paths.gallery, id, 'versions', versionId, 'version.json'),
      );
      if (!snapshot) continue;
      versions.push({
        id: snapshot.id,
        title: snapshot.title,
        outputTarget: snapshot.outputTarget,
        createdAt: snapshot.createdAt,
        ...(snapshot.deletedAt !== undefined ? { deletedAt: snapshot.deletedAt } : {}),
      });
    }

    summaries.push({
      id: family.id,
      title: family.title,
      featuredVersionId: family.featuredVersionId,
      versions,
      ...(family.linkedSourceFamilyId ? { linkedSourceFamilyId: family.linkedSourceFamilyId } : {}),
      updatedAt: family.updatedAt,
      ...(family.deletedAt !== undefined ? { deletedAt: family.deletedAt } : {}),
    });
  }

  return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
}
