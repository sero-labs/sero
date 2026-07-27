/**
 * Librarian analysis.
 *
 * Reanalysis replaces the generated profile only. Manual field overrides are
 * stored separately and are never touched here, so untouched fields refresh
 * and edited fields survive.
 */

import { itemDir, itemRecordPath } from '../../shared/paths';
import { mutateRecord, readRecord } from '../../shared/state-io';
import type { LibraryItemRecord } from '../../shared/records';
import type {
  AestheticTerm,
  LibrarianAnalysis,
  LibrarianUserFacingAnalysis,
  LibrarianVisualProfile,
  PaletteColour,
} from '../../shared/types';
import type { RuntimeHost } from '../host';
import {
  LIBRARIAN_PROMPT_VERSION,
  LIBRARIAN_SCHEMA_VERSION,
  LIBRARIAN_SYSTEM_PROMPT,
  buildLibrarianTask,
  extractJson,
  validateLibrarianReply,
} from './prompt';

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim())
    .slice(0, limit);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function visualProfile(value: unknown): LibrarianVisualProfile {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    colour: strings(record.colour, 4),
    typography: strings(record.typography, 4),
    layout: strings(record.layout, 4),
    spacingAndDensity: strings(record.spacingAndDensity, 4),
    shapeLanguage: strings(record.shapeLanguage, 4),
    surfaces: strings(record.surfaces, 4),
    imagery: strings(record.imagery, 4),
    motion: strings(record.motion, 4),
  };
}

function vocabulary(value: unknown): AestheticTerm[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry): AestheticTerm[] => {
      if (typeof entry === 'string') return [{ term: entry }];
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const term = text(record.term);
      if (!term) return [];
      const meaning = text(record.meaning);
      return [meaning ? { term, meaning } : { term }];
    })
    .slice(0, 8);
}

function palette(value: unknown): PaletteColour[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const colours = value
    .flatMap((entry): PaletteColour[] => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const hex = text(record.hex).toLowerCase();
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return [];
      return [{ hex, role: text(record.role, 'accent') }];
    })
    .slice(0, 8);
  return colours.length > 0 ? colours : undefined;
}

/** Normalise a model reply into the generated profile. Notes always start empty. */
export function toLibrarianAnalysis(
  parsed: unknown,
  provenance: LibrarianAnalysis['provenance'],
): LibrarianAnalysis {
  const record = (parsed ?? {}) as Record<string, unknown>;
  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
    ? Math.min(1, Math.max(0, record.confidence))
    : 0.5;

  const userFacing: LibrarianUserFacingAnalysis = {
    title: text(record.title, 'Untitled reference'),
    notes: '',
    designTypes: strings(record.designTypes, 3),
    primaryStyle: text(record.primaryStyle, 'Unclassified'),
    tags: strings(record.tags, 12),
    summary: text(record.summary),
    designIntent: text(record.designIntent),
    aestheticVocabulary: vocabulary(record.aestheticVocabulary),
    visualProfile: visualProfile(record.visualProfile),
    always: strings(record.always, 5),
    never: strings(record.never, 5),
    generationPrompt: text(record.generationPrompt),
  };

  const colours = palette(record.palette);

  return {
    ...userFacing,
    ...(colours ? { palette: colours } : {}),
    schemaVersion: LIBRARIAN_SCHEMA_VERSION,
    confidence,
    provenance,
  };
}

export interface AnalyseOptions {
  itemId: string;
  signal?: AbortSignal;
}

export async function analyseItem(host: RuntimeHost, options: AnalyseOptions): Promise<void> {
  const recordPath = itemRecordPath(host.paths, options.itemId);
  const existing = await readRecord<LibraryItemRecord>(recordPath);
  if (!existing) throw new Error(`Unknown Library item ${options.itemId}.`);

  await mutateRecord<LibraryItemRecord>(recordPath, (current) => ({
    ...(current ?? existing),
    analysisStatus: 'analysing',
    analysisAttempts: (current ?? existing).analysisAttempts + 1,
    ...(current?.analysisError !== undefined ? { analysisError: undefined } : {}),
    updatedAt: host.now(),
  }));

  const startedAt = host.now();
  const result = await host.runModel({
    task: buildLibrarianTask(existing.original.fileName),
    systemPrompt: LIBRARIAN_SYSTEM_PROMPT,
    cwd: itemDir(host.paths, options.itemId),
    platformTools: 'readOnly',
    repair: { maxAttempts: 3, validate: validateLibrarianReply },
    sessionKey: `librarian:${options.itemId}`,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (result.error) {
    const cancelled = result.error.startsWith('Aborted');
    await mutateRecord<LibraryItemRecord>(recordPath, (current) => ({
      ...(current ?? existing),
      analysisStatus: cancelled ? 'queued' : 'failed',
      analysisError: cancelled ? 'Analysis was cancelled.' : result.error,
      updatedAt: host.now(),
    }));
    if (!cancelled) throw new Error(result.error);
    return;
  }

  const parsed = extractJson(result.response);
  if (validateLibrarianReply(result.response) !== null) {
    await mutateRecord<LibraryItemRecord>(recordPath, (current) => ({
      ...(current ?? existing),
      analysisStatus: 'failed',
      analysisError: 'The Librarian did not return a usable analysis.',
      updatedAt: host.now(),
    }));
    throw new Error('The Librarian did not return a usable analysis.');
  }

  const generated = toLibrarianAnalysis(parsed, {
    ...(result.providerId ? { providerId: result.providerId } : {}),
    ...(result.modelId ? { modelId: result.modelId } : {}),
    analysedAt: host.now(),
    durationMs: result.durationMs ?? host.now() - startedAt,
    ...(result.costUsd !== undefined ? { cost: result.costUsd } : {}),
    promptVersion: LIBRARIAN_PROMPT_VERSION,
  });

  await mutateRecord<LibraryItemRecord>(recordPath, (current) => {
    const base = current ?? existing;
    return {
      ...base,
      analysisStatus: 'ready',
      analysisError: undefined,
      // Overrides are preserved untouched — only the generated profile refreshes.
      profile: { generated, overrides: base.profile?.overrides ?? {} },
      updatedAt: host.now(),
    };
  });
}
