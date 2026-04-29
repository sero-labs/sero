import {
  readJsonStateSync,
  writeJsonStateSync,
} from './json-state';
import { resolveMemoryStatePath } from './state-paths';

export type MemorySnapshotMode = 'frozen' | 'live';
export type AutoRetrieveMode = 'on' | 'off';

interface MemoryConfigState {
  snapshotMode?: MemorySnapshotMode;
  autoRetrieve?: AutoRetrieveMode;
}

const DEFAULT_CONFIG: MemoryConfigState = {};
const DEFAULT_SNAPSHOT_MODE: MemorySnapshotMode = 'frozen';
const DEFAULT_AUTO_RETRIEVE: AutoRetrieveMode = 'on';

function resolveConfigPath(): string {
  return resolveMemoryStatePath('config.json');
}

function normalizeSnapshotMode(value: unknown): MemorySnapshotMode {
  return value === 'live' || value === 'frozen'
    ? value
    : DEFAULT_SNAPSHOT_MODE;
}

function readConfigSync(): MemoryConfigState {
  return readJsonStateSync(resolveConfigPath(), { ...DEFAULT_CONFIG });
}

function writeConfigSync(state: MemoryConfigState): void {
  writeJsonStateSync(resolveConfigPath(), state);
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

export async function getMemorySnapshotMode(): Promise<MemorySnapshotMode> {
  return getMemorySnapshotModeSync();
}

export async function setMemorySnapshotMode(mode: MemorySnapshotMode): Promise<MemorySnapshotMode> {
  return setMemorySnapshotModeSync(mode);
}

export function describeMemorySnapshotMode(mode: MemorySnapshotMode): string {
  switch (mode) {
    case 'frozen':
      return 'frozen — identity, user, and long-term memory stay fixed for the session';
    case 'live':
      return 'live — memory context is rebuilt each turn';
  }
}

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

export async function getAutoRetrieveMode(): Promise<AutoRetrieveMode> {
  return getAutoRetrieveModeSync();
}

export async function setAutoRetrieveMode(mode: AutoRetrieveMode): Promise<AutoRetrieveMode> {
  return setAutoRetrieveModeSync(mode);
}

export function describeAutoRetrieveMode(mode: AutoRetrieveMode): string {
  switch (mode) {
    case 'on':
      return 'on — relevant memories are auto-retrieved each turn based on the user prompt';
    case 'off':
      return 'off — no automatic memory retrieval; use `sero memory_search` manually';
  }
}
