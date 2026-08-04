import { normalizeDesignSummary } from './design-summary';
import type { ExportSummary } from './export';
import { normalizeExportSummary } from './export';
import type { GalleryFamilyRecord } from './gallery';
import { normalizeGalleryFamily } from './gallery';
import type { AnalysisStatus, JobKind, JobStatus, JobTarget, MediaKind } from './records';
import { normalizeJobRecord } from './records';
import type { DesignSummary } from './types';

export interface ItemIndexEntry {
  id: string;
  title: string;
  fileName?: string;
  primaryStyle: string;
  tags: string[];
  designTypes: string[];
  kind: MediaKind;
  previewPath: string;
  analysisStatus: AnalysisStatus;
  analysisError?: string;
  awaitingFrames?: boolean;
  favourite: boolean;
  collectionIds: string[];
  colours: string[];
  sourceKind: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  edited: boolean;
}

export interface JobIndexEntry {
  id: string;
  kind: JobKind;
  status: JobStatus;
  target: JobTarget;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export type DesignIndexEntry = DesignSummary;
export type GalleryIndexEntry = GalleryFamilyRecord;
export type ExportIndexEntry = ExportSummary;

export interface EntityIndexes {
  items: ItemIndexEntry[];
  designs: DesignIndexEntry[];
  gallery: GalleryIndexEntry[];
  jobs: JobIndexEntry[];
  exports: ExportIndexEntry[];
}

export const EMPTY_INDEXES: EntityIndexes = {
  items: [],
  designs: [],
  gallery: [],
  jobs: [],
  exports: [],
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function analysisStatus(value: unknown): AnalysisStatus {
  return value === 'running' || value === 'ready' || value === 'failed' || value === 'cancelled'
    ? value
    : 'pending';
}

export function normalizeItemIndexEntry(value: unknown): ItemIndexEntry | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string') return null;
  return {
    id: entry.id,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled',
    ...(typeof entry.fileName === 'string' ? { fileName: entry.fileName } : {}),
    primaryStyle: typeof entry.primaryStyle === 'string' ? entry.primaryStyle : '',
    tags: strings(entry.tags),
    designTypes: strings(entry.designTypes),
    kind: entry.kind === 'video' ? 'video' : 'image',
    previewPath: typeof entry.previewPath === 'string' ? entry.previewPath : '',
    analysisStatus: analysisStatus(entry.analysisStatus),
    ...(typeof entry.analysisError === 'string' ? { analysisError: entry.analysisError } : {}),
    ...(entry.awaitingFrames === true ? { awaitingFrames: true } : {}),
    favourite: entry.favourite === true,
    collectionIds: strings(entry.collectionIds),
    colours: strings(entry.colours),
    sourceKind: typeof entry.sourceKind === 'string' ? entry.sourceKind : 'file',
    createdAt: number(entry.createdAt),
    updatedAt: number(entry.updatedAt),
    ...(typeof entry.deletedAt === 'number' ? { deletedAt: entry.deletedAt } : {}),
    edited: entry.edited === true,
  };
}

export function normalizeJobIndexEntry(value: unknown): JobIndexEntry | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string') return null;
  const record = normalizeJobRecord({ ...entry, attempts: 0 });
  if (!record) return null;
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    target: record.target,
    createdAt: record.createdAt,
    ...(record.completedAt === undefined ? {} : { completedAt: record.completedAt }),
    ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
  };
}

function normalizeList<T>(value: unknown, normalize: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const normalized = normalize(entry);
    return normalized === null ? [] : [normalized];
  });
}

export const normalizeItemIndex = (value: unknown) => normalizeList(value, normalizeItemIndexEntry);
export const normalizeDesignIndex = (value: unknown) => normalizeList(value, normalizeDesignSummary);
export const normalizeGalleryIndex = (value: unknown) => normalizeList(value, normalizeGalleryFamily);
export const normalizeJobIndex = (value: unknown) => normalizeList(value, normalizeJobIndexEntry);
export const normalizeExportIndex = (value: unknown) => normalizeList(value, normalizeExportSummary);
