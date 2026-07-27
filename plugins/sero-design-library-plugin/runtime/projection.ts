/**
 * The index is a pure projection of the records.
 *
 * Nothing here reads or writes files, and no summary carries information the
 * records do not already hold. That is what makes an interrupted index write
 * recoverable — the runtime can always rebuild the whole index by re-reading
 * the records, so a half-written index is a cache miss rather than data loss.
 */

import { effectiveAnalysis, isOverridden, LIBRARIAN_FIELDS } from '../shared/librarian';
import type { ItemRecord, JobRecord } from '../shared/records';
import type { ItemSummary, JobSummary } from '../shared/types';

const CARD_TAG_LIMIT = 6;

/** Everything keyword search covers: title, tags, notes and visible analysis. */
function buildSearchText(item: ItemRecord): string {
  const analysis = effectiveAnalysis(item.profile);
  const profile = analysis.visualProfile;
  const parts: string[] = [
    analysis.title,
    analysis.notes,
    analysis.primaryStyle,
    analysis.summary,
    analysis.designIntent,
    analysis.generationPrompt,
    ...analysis.tags,
    ...analysis.designTypes,
    ...analysis.always,
    ...analysis.never,
    ...analysis.aestheticVocabulary.flatMap((entry) => [entry.term, entry.meaning ?? '']),
    ...(analysis.palette ?? []).flatMap((entry) => [entry.hex, entry.role]),
    ...profile.colour,
    ...profile.typography,
    ...profile.layout,
    ...profile.spacingAndDensity,
    ...profile.shapeLanguage,
    ...profile.surfaces,
    ...profile.imagery,
    ...profile.motion,
    item.source.fileName ?? '',
  ];
  return parts
    .filter((part) => part !== '')
    .join(' ')
    .toLowerCase();
}

export function projectItem(item: ItemRecord, previewPath: string): ItemSummary {
  const analysis = effectiveAnalysis(item.profile);
  return {
    id: item.id,
    title: analysis.title,
    primaryStyle: analysis.primaryStyle,
    tags: analysis.tags.slice(0, CARD_TAG_LIMIT),
    designTypes: analysis.designTypes,
    kind: item.kind,
    previewPath,
    analysisStatus: item.analysis.status,
    ...(item.analysis.error === undefined ? {} : { analysisError: item.analysis.error }),
    favourite: item.favourite,
    collectionIds: item.collectionIds,
    colours: (analysis.palette ?? []).map((entry) => entry.hex),
    sourceKind: item.source.kind,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.deletedAt === undefined ? {} : { deletedAt: item.deletedAt }),
    edited: LIBRARIAN_FIELDS.some((field) => isOverridden(item.profile, field)),
    searchText: buildSearchText(item),
  };
}

export function projectJob(job: JobRecord): JobSummary {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    itemId: job.itemId,
    createdAt: job.createdAt,
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}

