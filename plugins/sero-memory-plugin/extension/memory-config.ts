import { readJsonState, writeJsonState } from './json-state';
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

async function readConfig(): Promise<MemoryConfigState> {
  return readJsonState(resolveConfigPath(), { ...DEFAULT_CONFIG });
}

async function writeConfig(state: MemoryConfigState): Promise<void> {
  await writeJsonState(resolveConfigPath(), state);
}

export async function getMemorySnapshotMode(): Promise<MemorySnapshotMode> {
  const env = process.env.SERO_MEMORY_SNAPSHOT_MODE?.trim().toLowerCase();
  if (env === 'live' || env === 'frozen') return env;
  return normalizeSnapshotMode((await readConfig()).snapshotMode);
}

export async function setMemorySnapshotMode(mode: MemorySnapshotMode): Promise<MemorySnapshotMode> {
  const nextMode = normalizeSnapshotMode(mode);
  const state = await readConfig();
  if (state.snapshotMode === nextMode) return nextMode;
  await writeConfig({
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

function normalizeAutoRetrieve(value: unknown): AutoRetrieveMode {
  return value === 'on' || value === 'off' ? value : DEFAULT_AUTO_RETRIEVE;
}

export async function getAutoRetrieveMode(): Promise<AutoRetrieveMode> {
  const env = process.env.SERO_MEMORY_AUTO_RETRIEVE?.trim().toLowerCase();
  if (env === 'on' || env === 'off') return env;
  return normalizeAutoRetrieve((await readConfig()).autoRetrieve);
}

export async function setAutoRetrieveMode(mode: AutoRetrieveMode): Promise<AutoRetrieveMode> {
  const nextMode = normalizeAutoRetrieve(mode);
  const state = await readConfig();
  if (state.autoRetrieve === nextMode) return nextMode;
  await writeConfig({ ...state, autoRetrieve: nextMode });
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
