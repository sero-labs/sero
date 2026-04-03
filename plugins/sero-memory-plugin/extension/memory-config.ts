import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type MemorySnapshotMode = 'frozen' | 'live';
export type AutoRetrieveMode = 'on' | 'off';

interface MemoryConfigState {
  snapshotMode?: MemorySnapshotMode;
  autoRetrieve?: AutoRetrieveMode;
}

const DEFAULT_CONFIG: MemoryConfigState = {};
const DEFAULT_SNAPSHOT_MODE: MemorySnapshotMode = 'frozen';
const DEFAULT_AUTO_RETRIEVE: AutoRetrieveMode = 'on';

function resolveSeroHome(): string {
  return process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
}

function resolveConfigPath(): string {
  return path.join(resolveSeroHome(), 'state', 'memory', 'config.json');
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeSnapshotMode(value: unknown): MemorySnapshotMode {
  return value === 'live' || value === 'frozen'
    ? value
    : DEFAULT_SNAPSHOT_MODE;
}

function readConfigSync(): MemoryConfigState {
  return readJsonFile(resolveConfigPath(), { ...DEFAULT_CONFIG });
}

function writeConfigSync(state: MemoryConfigState): void {
  writeJsonFile(resolveConfigPath(), state);
}

export function getMemorySnapshotModeSync(): MemorySnapshotMode {
  const env = process.env.SERO_MEMORY_SNAPSHOT_MODE?.trim().toLowerCase();
  if (env === 'live' || env === 'frozen') return env;
  return normalizeSnapshotMode(readConfigSync().snapshotMode);
}

export function setMemorySnapshotModeSync(mode: MemorySnapshotMode): MemorySnapshotMode {
  const nextMode = normalizeSnapshotMode(mode);
  const state = readConfigSync();
  if (state.snapshotMode === nextMode) return nextMode;
  writeConfigSync({
    ...state,
    snapshotMode: nextMode,
  });
  return nextMode;
}

export function describeMemorySnapshotMode(mode: MemorySnapshotMode): string {
  switch (mode) {
    case 'frozen':
      return 'frozen — identity, user, and long-term memory stay fixed for the session';
    case 'live':
      return 'live — memory context is rebuilt each turn';
  }
}

// ── Auto-retrieve ───────────────────────────────────────────

function normalizeAutoRetrieve(value: unknown): AutoRetrieveMode {
  return value === 'on' || value === 'off' ? value : DEFAULT_AUTO_RETRIEVE;
}

export function getAutoRetrieveModeSync(): AutoRetrieveMode {
  const env = process.env.SERO_MEMORY_AUTO_RETRIEVE?.trim().toLowerCase();
  if (env === 'on' || env === 'off') return env;
  return normalizeAutoRetrieve(readConfigSync().autoRetrieve);
}

export function setAutoRetrieveModeSync(mode: AutoRetrieveMode): AutoRetrieveMode {
  const nextMode = normalizeAutoRetrieve(mode);
  const state = readConfigSync();
  if (state.autoRetrieve === nextMode) return nextMode;
  writeConfigSync({ ...state, autoRetrieve: nextMode });
  return nextMode;
}

export function describeAutoRetrieveMode(mode: AutoRetrieveMode): string {
  switch (mode) {
    case 'on':
      return 'on — relevant memories are auto-retrieved each turn based on the user prompt';
    case 'off':
      return 'off — no automatic memory retrieval; use `sero memory_search` manually';
  }
}
