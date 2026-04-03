import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface MemoryTransparencyState {
  transcriptRecallIntroShownAt?: string;
  lastBackfillNoticeKey?: string;
}

const DEFAULT_STATE: MemoryTransparencyState = {};

function resolveStatePath(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'state', 'memory', 'transparency.json');
}

async function readState(): Promise<MemoryTransparencyState> {
  try {
    const raw = await fs.readFile(resolveStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as MemoryTransparencyState;
    return parsed && typeof parsed === 'object' ? parsed : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state: MemoryTransparencyState): Promise<void> {
  const filePath = resolveStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}

async function updateState(
  update: (state: MemoryTransparencyState) => MemoryTransparencyState,
): Promise<MemoryTransparencyState> {
  const current = await readState();
  const next = update(current);
  await writeState(next);
  return next;
}

export function getTranscriptExportDir(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'workspaces', 'global', 'memory', 'sessions');
}

export async function shouldShowTranscriptRecallIntro(): Promise<boolean> {
  const state = await readState();
  return !state.transcriptRecallIntroShownAt;
}

export async function markTranscriptRecallIntroShown(): Promise<void> {
  await updateState((state) => ({
    ...state,
    transcriptRecallIntroShownAt: new Date().toISOString(),
  }));
}

function buildBackfillNoticeKey(exported: number, skipped: number): string {
  return `${exported}:${skipped}`;
}

export async function shouldShowBackfillNotice(exported: number, skipped: number): Promise<boolean> {
  if (exported <= 0) return false;
  const state = await readState();
  return state.lastBackfillNoticeKey !== buildBackfillNoticeKey(exported, skipped);
}

export async function markBackfillNoticeShown(exported: number, skipped: number): Promise<void> {
  await updateState((state) => ({
    ...state,
    lastBackfillNoticeKey: buildBackfillNoticeKey(exported, skipped),
  }));
}
