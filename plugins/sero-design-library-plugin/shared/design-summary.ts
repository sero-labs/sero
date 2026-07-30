import type { OutputTarget, VariantStatus, VariationMode } from './design';
import type { DesignSummary, DesignVariantSummary } from './types';

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function status(value: unknown): VariantStatus {
  return value === 'running' || value === 'ready' || value === 'failed' || value === 'cancelled'
    ? value
    : 'pending';
}

function normalizeVariant(value: unknown, fallbackIndex: number): DesignVariantSummary | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string' || entry.id === '') return null;
  return {
    id: entry.id,
    index: number(entry.index, fallbackIndex),
    status: status(entry.status),
    ...(typeof entry.progress === 'string' && entry.progress !== '' ? { progress: entry.progress } : {}),
    ...(typeof entry.name === 'string' && entry.name !== '' ? { name: entry.name } : {}),
    ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
    ...(typeof entry.previewPath === 'string' ? { previewPath: entry.previewPath } : {}),
    warningCount: number(entry.warningCount, 0),
    revisionCount: number(entry.revisionCount, 0),
    ...(typeof entry.visibleRevisionId === 'string'
      ? { visibleRevisionId: entry.visibleRevisionId }
      : {}),
    ...(typeof entry.referenceItemId === 'string' ? { referenceItemId: entry.referenceItemId } : {}),
  };
}

export function normalizeDesignSummary(value: unknown): DesignSummary | null {
  const entry = object(value);
  if (!entry || typeof entry.id !== 'string' || entry.id === '') return null;
  return {
    id: entry.id,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled design',
    target: (entry.target === 'html' ? 'html' : 'react') satisfies OutputTarget,
    variationMode: (entry.variationMode === 'per-reference' ? 'per-reference' : 'blend') satisfies VariationMode,
    referenceItemIds: strings(entry.referenceItemIds),
    variants: Array.isArray(entry.variants)
      ? entry.variants.flatMap((candidate, index) => {
          const variant = normalizeVariant(candidate, index);
          return variant === null ? [] : [variant];
        })
      : [],
    createdAt: number(entry.createdAt, 0),
    updatedAt: number(entry.updatedAt, 0),
    ...(typeof entry.deletedAt === 'number' ? { deletedAt: entry.deletedAt } : {}),
  };
}
