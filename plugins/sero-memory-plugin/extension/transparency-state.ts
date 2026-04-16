import { readJsonState, updateJsonState } from './json-state';
import { getTranscriptExportDirPath, resolveMemoryStatePath } from './state-paths';

interface MemoryTransparencyState {
  transcriptRecallIntroShownAt?: string;
  lastBackfillNoticeKey?: string;
}

const DEFAULT_STATE: MemoryTransparencyState = {};

function resolveStatePath(): string {
  return resolveMemoryStatePath('transparency.json');
}

async function readState(): Promise<MemoryTransparencyState> {
  return readJsonState(resolveStatePath(), { ...DEFAULT_STATE });
}

export function getTranscriptExportDir(): string {
  return getTranscriptExportDirPath();
}

export async function shouldShowTranscriptRecallIntro(): Promise<boolean> {
  const state = await readState();
  return !state.transcriptRecallIntroShownAt;
}

export async function markTranscriptRecallIntroShown(): Promise<void> {
  await updateJsonState(resolveStatePath(), { ...DEFAULT_STATE }, (state) => ({
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
  await updateJsonState(resolveStatePath(), { ...DEFAULT_STATE }, (state) => ({
    ...state,
    lastBackfillNoticeKey: buildBackfillNoticeKey(exported, skipped),
  }));
}
