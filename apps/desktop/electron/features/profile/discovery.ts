/**
 * Profile discovery — find profile directories that exist on disk but are not
 * registered, so a user can recover them after a registry reset.
 *
 * Read-only. The Sero root and registry path are arguments rather than module
 * imports so this stays free of `manager.ts` (no import cycle) and is testable
 * against a temporary directory.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

import type { DiscoveredProfile, ProfileFolderProvenance } from '@/types/profile';

/** A profile recovered from a broken registry, ready to be written back. */
export interface SalvageCandidate {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  folderProvenance?: ProfileFolderProvenance;
  onboarded?: boolean;
}

const AGENT_DIR = 'agent';
const MANAGED_PROFILES_DIR = 'profiles';
const BROKEN_REGISTRY_PREFIX = 'profiles.broken-';
/** Conventional name for the first production profile, which lives at the Sero root. */
const DEFAULT_PROFILE_NAME = 'Default';
const PROFILE_AGENT_FILES = [
  'settings.json',
  'auth.json',
  'models.json',
  'layout.json',
  'workspaces.json',
  '.env',
];

export interface DiscoveryInput {
  /** The fixed Sero root that holds `profiles.json`. */
  seroRoot: string;
  /** Absolute path to `profiles.json`. */
  registryPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Tolerant read of a profile array. Malformed input yields no entries. */
function readProfileArray(raw: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) return [];
  return parsed.profiles.filter(isRecord);
}

function readProfileArrayFromFile(filePath: string): Array<Record<string, unknown>> {
  try {
    return readProfileArray(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function toProvenance(value: unknown): ProfileFolderProvenance | undefined {
  return value === 'default-root' || value === 'sero-managed' || value === 'custom'
    ? value
    : undefined;
}

/** A directory is a profile when it holds an `agent/` child. */
export function isProfileDirectory(candidatePath: string): boolean {
  try {
    return statSync(path.join(candidatePath, AGENT_DIR)).isDirectory();
  } catch {
    return false;
  }
}

function newestMtime(targets: string[]): number {
  let newest = 0;
  for (const target of targets) {
    try {
      newest = Math.max(newest, statSync(target).mtimeMs);
    } catch {
      // Missing file: not a candidate for the newest modification time.
    }
  }
  return newest;
}

/** Newest modification time of the profile directory and its agent files. */
function profileLastModified(profilePath: string): string {
  const agentDir = path.join(profilePath, AGENT_DIR);
  const targets = [
    profilePath,
    agentDir,
    ...PROFILE_AGENT_FILES.map((fileName) => path.join(agentDir, fileName)),
  ];
  return new Date(newestMtime(targets)).toISOString();
}

/** True when a directory is a profile and holds profile data, not just an empty agent dir. */
function hasProfileData(profilePath: string): boolean {
  const agentDir = path.join(profilePath, AGENT_DIR);
  return PROFILE_AGENT_FILES.some((fileName) => existsSync(path.join(agentDir, fileName)));
}

/** Paths the current registry already references. */
function readRegisteredPaths(registryPath: string): Set<string> {
  const registered = new Set<string>();
  for (const entry of readProfileArrayFromFile(registryPath)) {
    if (typeof entry.path === 'string') registered.add(path.resolve(entry.path));
  }
  return registered;
}

/** Entries from the newest `profiles.broken-<timestamp>.json` beside the registry. */
function readLatestBrokenRegistry(seroRoot: string): Array<Record<string, unknown>> {
  let names: string[];
  try {
    names = readdirSync(seroRoot);
  } catch {
    return [];
  }

  const backups = names
    .filter((name) => name.startsWith(BROKEN_REGISTRY_PREFIX) && name.endsWith('.json'))
    .sort()
    .reverse();
  if (backups.length === 0) return [];

  return readProfileArrayFromFile(path.join(seroRoot, backups[0]));
}

/**
 * Find profiles that exist on disk but are not in the registry.
 *
 * Sources:
 * 1. Directories under `<seroRoot>/profiles/` that contain an `agent/` child.
 * 2. The Sero root itself, when it holds profile data. The first production
 *    profile lives there, not under `profiles/`.
 * 3. Entries from the newest broken-registry backup whose recorded path exists.
 *
 * A recorded entry wins on a path collision: its id, name and recorded
 * ownership are kept. Identity and ownership are never inferred from the
 * location, so a profile the registry never described stays unknown.
 */
export function discoverProfiles({ seroRoot, registryPath }: DiscoveryInput): DiscoveredProfile[] {
  const registered = readRegisteredPaths(registryPath);
  const byPath = new Map<string, DiscoveredProfile>();

  const managedRoot = path.join(seroRoot, MANAGED_PROFILES_DIR);
  let entries: string[] = [];
  try {
    entries = readdirSync(managedRoot);
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    const full = path.join(managedRoot, entry);
    if (!isProfileDirectory(full)) continue;
    const key = path.resolve(full);
    if (registered.has(key) || byPath.has(key)) continue;
    byPath.set(key, {
      // No recorded identity, so mint a fresh one. Adoption reuses it as-is.
      id: randomUUID(),
      name: entry,
      path: full,
      lastModified: profileLastModified(full),
    });
  }

  // The Sero root itself, when it holds real profile data. Requiring profile
  // data keeps a fresh installation out of the recovery list.
  const rootKey = path.resolve(seroRoot);
  if (!registered.has(rootKey) && !byPath.has(rootKey) && hasProfileData(seroRoot)) {
    byPath.set(rootKey, {
      id: randomUUID(),
      name: DEFAULT_PROFILE_NAME,
      path: seroRoot,
      lastModified: profileLastModified(seroRoot),
    });
  }

  for (const recorded of readLatestBrokenRegistry(seroRoot)) {
    const recordedPath = recorded.path;
    const recordedId = recorded.id;
    const recordedName = recorded.name;
    if (typeof recordedPath !== 'string' || typeof recordedId !== 'string' || typeof recordedName !== 'string') {
      continue;
    }
    const resolved = path.resolve(recordedPath);
    if (!existsSync(resolved)) continue;
    if (registered.has(resolved)) continue;
    byPath.set(resolved, {
      id: recordedId,
      name: recordedName,
      path: resolved,
      lastModified: profileLastModified(resolved),
      // Ownership comes only from the record. Location never grants it.
      folderProvenance: toProvenance(recorded.folderProvenance),
      onboarded: typeof recorded.onboarded === 'boolean' ? recorded.onboarded : undefined,
    });
  }

  return [...byPath.values()];
}

/**
 * Profiles named by a broken registry whose directories still exist.
 *
 * Used by the startup recovery dialog to offer salvage before a reset. A file
 * that cannot be parsed yields no candidates, which leaves Reset as the only
 * option.
 */
export function selectSalvageCandidates(registryPath: string): SalvageCandidate[] {
  const seen = new Set<string>();
  const candidates: SalvageCandidate[] = [];

  for (const entry of readProfileArrayFromFile(registryPath)) {
    const { id, name, path: profilePath, createdAt } = entry;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof profilePath !== 'string') {
      continue;
    }
    const resolved = path.resolve(profilePath);
    if (!existsSync(resolved) || seen.has(resolved)) continue;
    seen.add(resolved);
    candidates.push({
      id,
      name,
      path: resolved,
      createdAt: typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
      folderProvenance: toProvenance(entry.folderProvenance),
      onboarded: typeof entry.onboarded === 'boolean' ? entry.onboarded : undefined,
    });
  }

  return candidates;
}
