// Single source of truth for state shared across extension, runtime and UI.
// JSON-serialisable only: no Date, Map, Set or functions.

import { ACTIVITY_STATES, type ActivityState } from '@sero-ai/common';
import type { ProjectActivity } from './activity';

export const ARCHITECT_APP_ID = 'architect';

export type { ProjectActivity } from './activity';

export type ArchitectPhase = 'intake' | 'discovery' | 'charter' | 'build' | 'release' | 'maintain';
export type ArchitectOverlay = 'decision' | 'blocked' | 'paused' | 'limited';

/**
 * One row of the watched index. The UI, the widget and the management tool read
 * only this; the full record stays in the project file.
 */
export interface ArchitectIndexEntry {
  id: string;
  name: string;
  workspaceId: string | null;
  phase: ArchitectPhase;
  overlay: ArchitectOverlay | null;
  /**
   * The derived activity: the state that matters, whose work it is, and the
   * action it needs. Derived from the record on every write (shared/activity.ts),
   * never written by the owner model.
   */
  activity: ProjectActivity;
  /** Known completed work as a count, never a percentage. */
  milestones: { accepted: number; total: number };
  spentUsd: number;
  usageIncomplete?: boolean;
  capUsd: number | null;
  /** Open decisions and approvals waiting on the user. */
  needsYou: number;
  updatedAt: string;
}

export interface ArchitectIndex {
  version: 1;
  projects: ArchitectIndexEntry[];
  /**
   * Whether the Architect runtime is running in this Sero session, written at
   * extension activation whether or not the kill switch allows the runtime. A
   * reader uses it to say so once, at the top of the list, instead of leaving
   * every row to guess.
   */
  runtime?: { running: boolean; startedAt: string };
}

export const DEFAULT_INDEX: ArchitectIndex = { version: 1, projects: [] };

const PHASES: readonly ArchitectPhase[] = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];
const OVERLAYS: readonly ArchitectOverlay[] = ['decision', 'blocked', 'paused', 'limited'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeEntry(value: unknown): ArchitectIndexEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (!PHASES.includes(value.phase as ArchitectPhase)) return null;
  const overlay = OVERLAYS.includes(value.overlay as ArchitectOverlay) ? (value.overlay as ArchitectOverlay) : null;
  return {
    id: value.id,
    name: value.name,
    workspaceId: typeof value.workspaceId === 'string' ? value.workspaceId : null,
    phase: value.phase as ArchitectPhase,
    overlay,
    activity: normalizeActivity(value.activity),
    milestones: normalizeCounts(value.milestones),
    usageIncomplete: value.usageIncomplete !== false,
    spentUsd: typeof value.spentUsd === 'number' && Number.isFinite(value.spentUsd) ? value.spentUsd : 0,
    capUsd: typeof value.capUsd === 'number' && Number.isFinite(value.capUsd) ? value.capUsd : null,
    needsYou: typeof value.needsYou === 'number' && Number.isFinite(value.needsYou) ? value.needsYou : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

function normalizeCounts(value: unknown): { accepted: number; total: number } {
  if (!isRecord(value)) return { accepted: 0, total: 0 };
  const number = (candidate: unknown) => (typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0);
  return { accepted: number(value.accepted), total: number(value.total) };
}

/**
 * An entry written before this change has no activity. It reads as last known
 * rather than as anything happening, which is the safe direction.
 */
function normalizeActivity(value: unknown): ProjectActivity {
  const fallback: ProjectActivity = {
    state: 'last-known',
    headline: 'Last known state',
    owner: 'No report since this project was last saved',
  };
  if (!isRecord(value)) return fallback;
  if (!ACTIVITY_STATES.includes(value.state as ActivityState)) return fallback;
  const text = (candidate: unknown, or = '') => (typeof candidate === 'string' ? candidate : or);
  return {
    state: value.state as ActivityState,
    headline: text(value.headline, fallback.headline),
    owner: text(value.owner),
    ...(typeof value.ownerAt === 'string' ? { ownerAt: value.ownerAt } : {}),
    ...(typeof value.ownerSuffix === 'string' ? { ownerSuffix: value.ownerSuffix } : {}),
    ...(typeof value.action === 'string' ? { action: value.action } : {}),
    ...(typeof value.lastReportAt === 'string' ? { lastReportAt: value.lastReportAt } : {}),
  };
}

function normalizeRuntime(value: unknown): ArchitectIndex['runtime'] {
  if (!isRecord(value) || typeof value.running !== 'boolean') return undefined;
  return { running: value.running, startedAt: typeof value.startedAt === 'string' ? value.startedAt : '' };
}

export function normalizeIndex(value: unknown): ArchitectIndex {
  if (!isRecord(value) || !Array.isArray(value.projects)) return { ...DEFAULT_INDEX, projects: [] };
  const runtime = normalizeRuntime(value.runtime);
  return {
    version: 1,
    projects: value.projects.map(normalizeEntry).filter((entry): entry is ArchitectIndexEntry => entry !== null),
    ...(runtime ? { runtime } : {}),
  };
}
