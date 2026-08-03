/**
 * The index is a pure projection of the records.
 *
 * Nothing here reads or writes files, and no summary carries information the
 * records do not already hold. That is what makes an interrupted index write
 * recoverable — the runtime can always rebuild the whole index by re-reading
 * the records, so a half-written index is a cache miss rather than data loss.
 */

import type { DesignRecord, DesignVariant } from '../shared/design';
import { orderedReferences, visibleRevision } from '../shared/design';
import { effectiveAnalysis, isOverridden, LIBRARIAN_FIELDS } from '../shared/librarian';
import type { ItemRecord, JobRecord } from '../shared/records';
import type { ItemIndexEntry, JobIndexEntry } from '../shared/indexes';
import type { DesignSummary, DesignVariantSummary } from '../shared/types';

export function projectItem(item: ItemRecord, previewPath: string): ItemIndexEntry {
  const analysis = effectiveAnalysis(item.profile);
  return {
    id: item.id,
    title: analysis.title,
    ...(item.source.fileName === undefined ? {} : { fileName: item.source.fileName }),
    primaryStyle: analysis.primaryStyle,
    tags: analysis.tags,
    designTypes: analysis.designTypes,
    kind: item.kind,
    previewPath,
    analysisStatus: item.analysis.status,
    ...(item.awaitingFrames === true ? { awaitingFrames: true } : {}),
    ...(item.analysis.error === undefined ? {} : { analysisError: item.analysis.error }),
    favourite: item.favourite,
    collectionIds: item.collectionIds,
    colours: (analysis.palette ?? []).map((entry) => entry.hex),
    sourceKind: item.source.kind,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.deletedAt === undefined ? {} : { deletedAt: item.deletedAt }),
    edited: LIBRARIAN_FIELDS.some((field) => isOverridden(item.profile, field)),
  };
}

export function projectJob(job: JobRecord): JobIndexEntry {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    target: job.target,
    createdAt: job.createdAt,
    ...(job.completedAt === undefined ? {} : { completedAt: job.completedAt }),
    ...(job.error === undefined ? {} : { error: job.error }),
  };
}

function projectVariant(design: DesignRecord, variant: DesignVariant): DesignVariantSummary {
  const revision = visibleRevision(variant);
  const built =
    revision?.builtFile === undefined
      ? {}
      : {
          previewPath: `designs/${design.id}/variants/${variant.id}/${revision.id}/${revision.builtFile}`,
        };
  return {
    id: variant.id,
    index: variant.index,
    status: variant.status,
    ...(variant.progress === undefined ? {} : { progress: variant.progress }),
    ...(variant.error === undefined ? {} : { error: variant.error }),
    ...built,
    ...(revision?.name === undefined || revision.name === '' ? {} : { name: revision.name }),
    warningCount: revision?.buildWarnings.length ?? 0,
    revisionCount: variant.revisions.length,
    ...(variant.visibleRevisionId === undefined
      ? {}
      : { visibleRevisionId: variant.visibleRevisionId }),
    ...(variant.referenceItemId === undefined
      ? {}
      : { referenceItemId: variant.referenceItemId }),
  };
}

export function projectDesign(design: DesignRecord): DesignSummary {
  return {
    id: design.id,
    title: design.title,
    target: design.brief.target,
    variationMode: design.brief.variationMode,
    referenceItemIds: orderedReferences(design).map((reference) => reference.itemId),
    variants: design.variants
      .toSorted((a, b) => a.index - b.index)
      .map((variant) => projectVariant(design, variant)),
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
    ...(design.deletedAt === undefined ? {} : { deletedAt: design.deletedAt }),
  };
}
