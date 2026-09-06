// Single source of truth for state shared across extension, runtime and UI.
// JSON-serialisable only: no Date, Map, Set or functions.

export const ARCHITECT_APP_ID = 'architect';

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
  /** The Architect's one-line state, its own words. */
  stateLine: string;
  spentUsd: number;
  capUsd: number | null;
  /** Open decisions and approvals waiting on the user. */
  needsYou: number;
  updatedAt: string;
}

export interface ArchitectIndex {
  version: 1;
  projects: ArchitectIndexEntry[];
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
    stateLine: typeof value.stateLine === 'string' ? value.stateLine : '',
    spentUsd: typeof value.spentUsd === 'number' && Number.isFinite(value.spentUsd) ? value.spentUsd : 0,
    capUsd: typeof value.capUsd === 'number' && Number.isFinite(value.capUsd) ? value.capUsd : null,
    needsYou: typeof value.needsYou === 'number' && Number.isFinite(value.needsYou) ? value.needsYou : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

export function normalizeIndex(value: unknown): ArchitectIndex {
  if (!isRecord(value) || !Array.isArray(value.projects)) return { ...DEFAULT_INDEX, projects: [] };
  return {
    version: 1,
    projects: value.projects.map(normalizeEntry).filter((entry): entry is ArchitectIndexEntry => entry !== null),
  };
}
