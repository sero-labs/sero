/**
 * Build a `ProfileSnapshot` for a given profile path.
 *
 * Pure read-only inspection. Used by both in-app and safe-mode contexts
 * — no Electron, no native modules, no `loadSeroEnv()`.
 */

import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { readJsonFile, readAuthFile, readDotEnvFile } from './read';
import type { ProfileSnapshot, ProfileSnapshotFiles } from './types';

const SERO_FIXED_ROOT = path.join(os.homedir(), '.sero-ui');
const REGISTRY_PATH = path.join(SERO_FIXED_ROOT, 'profiles.json');

interface MinimalProfileEntry {
  id: string;
  name: string;
  path: string;
}

interface MinimalRegistry {
  activeProfileId: string | null;
  profiles: MinimalProfileEntry[];
}

/** Read profiles.json without throwing. Returns empty registry on any error. */
export function readRegistryLenient(): MinimalRegistry {
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MinimalRegistry>;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter(
          (p): p is MinimalProfileEntry =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as MinimalProfileEntry).id === 'string' &&
            typeof (p as MinimalProfileEntry).name === 'string' &&
            typeof (p as MinimalProfileEntry).path === 'string',
        )
      : [];
    return {
      activeProfileId:
        typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
      profiles,
    };
  } catch {
    return { activeProfileId: null, profiles: [] };
  }
}

/** Detect orphan profile-shaped directories under SERO_FIXED_ROOT/profiles. */
export function detectOrphanProfileDirs(registry: MinimalRegistry): MinimalProfileEntry[] {
  const orphans: MinimalProfileEntry[] = [];
  const managedRoot = path.join(SERO_FIXED_ROOT, 'profiles');
  if (!existsSync(managedRoot)) return orphans;

  let entries: string[];
  try {
    entries = readdirSync(managedRoot);
  } catch {
    return orphans;
  }

  const known = new Set(registry.profiles.map((p) => p.path));
  for (const entry of entries) {
    const full = path.join(managedRoot, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (known.has(full)) continue;
    if (!existsSync(path.join(full, 'agent'))) continue;
    orphans.push({
      id: `orphan:${entry}`,
      name: `(orphan) ${entry}`,
      path: full,
    });
  }
  return orphans;
}

function isWritable(p: string): boolean {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readProfileFiles(profilePath: string): ProfileSnapshotFiles {
  const agentDir = path.join(profilePath, 'agent');
  return {
    settings: readJsonFile(path.join(agentDir, 'settings.json')),
    auth: readAuthFile(path.join(agentDir, 'auth.json')),
    env: readDotEnvFile(path.join(agentDir, '.env')),
    models: readJsonFile(path.join(agentDir, 'models.json')),
    layout: readJsonFile(path.join(agentDir, 'layout.json')),
    workspaces: readJsonFile(path.join(agentDir, 'workspaces.json')),
  };
}

export function buildProfileSnapshot(
  entry: MinimalProfileEntry,
  options: { isActive: boolean; isOrphan: boolean },
): ProfileSnapshot {
  const profilePath = entry.path;
  const agentDir = path.join(profilePath, 'agent');
  const pathExists = existsSync(profilePath);
  const agentDirExists = existsSync(agentDir);
  const agentDirWritable = agentDirExists && isWritable(agentDir);

  return {
    id: entry.id,
    name: entry.name,
    path: profilePath,
    isActive: options.isActive,
    isOrphan: options.isOrphan,
    pathExists,
    agentDirExists,
    agentDirWritable,
    files: readProfileFiles(profilePath),
  };
}

export interface SnapshotSelection {
  /** When provided, only this profile id (or path) is loaded. */
  profileFilter?: string;
  /** When true, all registered profiles + orphans are loaded. */
  allProfiles?: boolean;
}

export interface SnapshotBundle {
  active: ProfileSnapshot | null;
  all: ProfileSnapshot[];
}

export function buildSnapshots(selection: SnapshotSelection = {}): SnapshotBundle {
  const registry = readRegistryLenient();
  const orphans = detectOrphanProfileDirs(registry);
  const allEntries: Array<{ entry: MinimalProfileEntry; orphan: boolean }> = [
    ...registry.profiles.map((entry) => ({ entry, orphan: false })),
    ...orphans.map((entry) => ({ entry, orphan: true })),
  ];

  const matches = (e: MinimalProfileEntry) => {
    const f = selection.profileFilter;
    if (!f) return false;
    return e.id === f || e.path === f;
  };

  let selected: typeof allEntries;
  if (selection.allProfiles) {
    selected = allEntries;
  } else if (selection.profileFilter) {
    selected = allEntries.filter((e) => matches(e.entry));
  } else if (registry.activeProfileId) {
    selected = allEntries.filter((e) => e.entry.id === registry.activeProfileId);
  } else if (registry.profiles.length > 0) {
    selected = [{ entry: registry.profiles[0], orphan: false }];
  } else {
    selected = [];
  }

  const snapshots = selected.map(({ entry, orphan }) =>
    buildProfileSnapshot(entry, {
      isActive: entry.id === registry.activeProfileId,
      isOrphan: orphan,
    }),
  );

  const active = snapshots.find((s) => s.isActive) ?? snapshots[0] ?? null;
  return { active, all: snapshots };
}
