/**
 * ProfileManager — manages the profile registry.
 *
 * Registry file: ~/.sero-ui/profiles.json (fixed path, never changes).
 * Each profile entry points to a SERO_HOME directory on disk.
 *
 * This module is intentionally synchronous-first for the critical path
 * (reading the active profile at startup in env.ts). Async methods are
 * used for mutations that happen after the app is running.
 *
 * ⚠️  This module is imported by env.ts at process startup.
 *     Do NOT import anything that reads SERO_HOME or SERO_AGENT_DIR at
 *     module level — those are not yet initialised when this runs.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import type { ProfileInfo, ProfileRemovalMode } from '@/types/profile';
import type { ProfileEntry, ProfileRegistry } from './types';

function resolveSeroRoot(): string {
  if (process.env.NODE_ENV === 'test' && process.env.SERO_FIXED_ROOT_OVERRIDE) {
    return path.resolve(process.env.SERO_FIXED_ROOT_OVERRIDE);
  }
  if (process.env.SERO_HOME_OVERRIDE) {
    return path.resolve(process.env.SERO_HOME_OVERRIDE);
  }
  return path.join(os.homedir(), '.sero-ui');
}

/** Fixed location for the profile registry — never changes. */
const SERO_ROOT = resolveSeroRoot();
const REGISTRY_PATH = path.join(SERO_ROOT, 'profiles.json');
export const PROFILE_REGISTRY_PATH = REGISTRY_PATH;

/** Default SERO_HOME for the auto-created "Default" profile. */
const DEFAULT_PROFILE_PATH = SERO_ROOT;
const MANAGED_PROFILES_ROOT = path.join(SERO_ROOT, 'profiles');


export function canDeleteProfileFiles(profile: ProfileEntry): boolean {
  return profile.folderProvenance === 'sero-managed'
    && path.resolve(profile.path) !== DEFAULT_PROFILE_PATH
    && isManagedNestedProfilePath(path.resolve(profile.path));
}
// ── Registry I/O ────────────────────────────────────────────

function emptyRegistry(): ProfileRegistry {
  return { version: 1, activeProfileId: null, profiles: [] };
}

export class ProfileRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileRegistryError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNestedPath(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isManagedNestedProfilePath(profilePath: string): boolean {
  return isNestedPath(MANAGED_PROFILES_ROOT, profilePath);
}

function isAllowedDefaultProfileContainment(
  existingPath: string,
  candidatePath: string,
): boolean {
  return existingPath === DEFAULT_PROFILE_PATH && isManagedNestedProfilePath(candidatePath);
}

function slugForProfileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'profile';
}

function isProfileEntry(value: unknown): value is ProfileEntry {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.createdAt === 'string'
    && (value.folderProvenance === undefined
      || value.folderProvenance === 'default-root'
      || value.folderProvenance === 'sero-managed'
      || value.folderProvenance === 'custom')
    && (value.onboarded === undefined || typeof value.onboarded === 'boolean');
}

function parseRegistry(raw: string): ProfileRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse failure';
    throw new ProfileRegistryError(`profiles.json is malformed: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new ProfileRegistryError('profiles.json must contain a JSON object');
  }

  const { activeProfileId, profiles, version } = parsed;
  if (version !== undefined && version !== 1) {
    throw new ProfileRegistryError(`profiles.json has unsupported version: ${String(version)}`);
  }
  if (activeProfileId !== null && activeProfileId !== undefined && typeof activeProfileId !== 'string') {
    throw new ProfileRegistryError('profiles.json activeProfileId must be a string or null');
  }
  if (!Array.isArray(profiles) || !profiles.every(isProfileEntry)) {
    throw new ProfileRegistryError('profiles.json profiles must be an array of valid profile entries');
  }

  return {
    version: 1,
    activeProfileId: activeProfileId ?? null,
    profiles,
  };
}

/** Read registry synchronously. Missing registry = empty; malformed registry = explicit failure. */
export function readRegistrySync(): ProfileRegistry {
  if (!existsSync(REGISTRY_PATH)) return emptyRegistry();
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  return parseRegistry(raw);
}

export interface ProfileRegistryLoadResult {
  registry: ProfileRegistry;
  error: ProfileRegistryError | null;
}

/** Read registry without throwing for malformed JSON. Used by startup recovery flows. */
export function readRegistryLoadSync(): ProfileRegistryLoadResult {
  try {
    return { registry: readRegistrySync(), error: null };
  } catch (error) {
    if (error instanceof ProfileRegistryError) {
      return { registry: emptyRegistry(), error };
    }
    throw error;
  }
}

/** Write registry synchronously. */
function writeRegistrySync(registry: ProfileRegistry): void {
  mkdirSync(SERO_ROOT, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

function defaultManagedPathForName(name: string, existingProfiles: ProfileEntry[]): string {
  const slug = slugForProfileName(name);
  let candidate = path.join(MANAGED_PROFILES_ROOT, slug);
  let suffix = 1;
  while (existingProfiles.some((p) => p.path === candidate)) {
    candidate = path.join(MANAGED_PROFILES_ROOT, `${slug}-${suffix}`);
    suffix++;
  }
  return candidate;
}

function repairIsolatedRootProfiles(registry: ProfileRegistry): boolean {
  if (!process.env.SERO_HOME_OVERRIDE) return false;

  let changed = false;
  const repairedProfiles: ProfileEntry[] = [];
  for (const profile of registry.profiles) {
    if (path.resolve(profile.path) !== DEFAULT_PROFILE_PATH) {
      repairedProfiles.push(profile);
      continue;
    }

    const repairedPath = defaultManagedPathForName(profile.name, repairedProfiles);
    repairedProfiles.push({ ...profile, path: repairedPath, folderProvenance: 'sero-managed' });
    mkdirSync(path.join(repairedPath, 'agent'), { recursive: true });
    changed = true;
  }

  if (changed) registry.profiles = repairedProfiles;
  return changed;
}

/** Write registry asynchronously (for non-critical-path mutations). */
async function writeRegistryAsync(registry: ProfileRegistry): Promise<void> {
  await fs.mkdir(SERO_ROOT, { recursive: true });
  const tmpFile = `${REGISTRY_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  await fs.rename(tmpFile, REGISTRY_PATH);
}

export interface ProfileRegistryResetResult {
  registryPath: string;
  backupPath: string | null;
}

/**
 * Preserve a malformed profiles.json for inspection, then replace it with a
 * fresh empty registry so the app can recover on next launch.
 */
export function backupAndResetRegistrySync(): ProfileRegistryResetResult {
  mkdirSync(SERO_ROOT, { recursive: true });

  let backupPath: string | null = null;
  if (existsSync(REGISTRY_PATH)) {
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
    backupPath = path.join(SERO_ROOT, `profiles.broken-${timestamp}.json`);
    copyFileSync(REGISTRY_PATH, backupPath);
  }

  writeRegistrySync(emptyRegistry());
  return { registryPath: REGISTRY_PATH, backupPath };
}

// ── ProfileManager ──────────────────────────────────────────

class ProfileManager {
  private registry: ProfileRegistry;
  private loadError: ProfileRegistryError | null = null;

  constructor() {
    const result = readRegistryLoadSync();
    this.registry = result.registry;
    this.loadError = result.error;
    if (!this.loadError && repairIsolatedRootProfiles(this.registry)) {
      writeRegistrySync(this.registry);
    }
  }

  /** Reload registry from disk (e.g. after external modification). */
  reload(): void {
    this.registry = readRegistrySync();
    this.loadError = null;
  }

  getLoadError(): ProfileRegistryError | null {
    return this.loadError;
  }

  // ── Queries ─────────────────────────────────────────────

  /** Get all profiles as renderer-safe ProfileInfo objects. */
  list(): ProfileInfo[] {
    return this.registry.profiles.map((p) => ({
      ...p,
      canDeleteFiles: canDeleteProfileFiles(p),
      isActive: p.id === this.registry.activeProfileId,
    }));
  }

  /** Get the currently active profile, or null if none. */
  getActive(): ProfileEntry | null {
    if (!this.registry.activeProfileId) return null;
    return this.registry.profiles.find(
      (p) => p.id === this.registry.activeProfileId,
    ) ?? null;
  }

  /** Get the active profile ID. */
  getActiveId(): string | null {
    return this.registry.activeProfileId;
  }

  /** Check if any profile exists. */
  hasProfiles(): boolean {
    return this.registry.profiles.length > 0;
  }

  /** Find a profile by ID. */
  findById(id: string): ProfileEntry | null {
    return this.registry.profiles.find((p) => p.id === id) ?? null;
  }

  // ── Mutations ───────────────────────────────────────────

  /**
   * Create a new profile.
   * @param name Display name
   * @param profilePath Absolute path for the profile's SERO_HOME.
   *   Defaults to ~/.sero-ui/ for the first profile, or
   *   ~/.sero-ui/profiles/<slug>/ for subsequent ones.
   * @param activate If true, set as active immediately.
   */
  async create(
    name: string,
    profilePath?: string,
    activate = false,
  ): Promise<ProfileEntry> {
    const id = randomUUID();
    const resolvedPath = profilePath
      ? path.resolve(profilePath)
      : this.defaultPathForName(name);

    this.validateNewProfilePath(resolvedPath);

    // Ensure the profile directory exists
    await fs.mkdir(resolvedPath, { recursive: true });
    await fs.mkdir(path.join(resolvedPath, 'agent'), { recursive: true });
    const workspaceRegistryPath = path.join(resolvedPath, 'agent', 'workspaces.json');
    if (!existsSync(workspaceRegistryPath)) {
      await fs.writeFile(workspaceRegistryPath, '{\n  "workspaces": []\n}\n', 'utf8');
    }

    const entry: ProfileEntry = {
      id,
      name: name.trim(),
      path: resolvedPath,
      createdAt: new Date().toISOString(),
      folderProvenance: profilePath
        ? 'custom'
        : resolvedPath === DEFAULT_PROFILE_PATH
          ? 'default-root'
          : 'sero-managed',
    };

    this.registry.profiles.push(entry);

    if (activate || !this.registry.activeProfileId) {
      this.registry.activeProfileId = id;
    }

    await writeRegistryAsync(this.registry);
    return entry;
  }

  /** Set the active profile. Does NOT restart the app — caller must do that. */
  async setActive(id: string): Promise<void> {
    const profile = this.findById(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);

    this.registry.activeProfileId = id;
    await writeRegistryAsync(this.registry);
  }

  /** Mark a profile as onboarded. */
  async markOnboarded(id: string): Promise<void> {
    const profile = this.findById(id);
    if (!profile) return;
    profile.onboarded = true;
    await writeRegistryAsync(this.registry);
  }

  /** Rename a profile's display name. */
  async rename(id: string, newName: string): Promise<void> {
    const profile = this.findById(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);

    profile.name = newName.trim();
    await writeRegistryAsync(this.registry);
  }

  /**
   * Remove an inactive profile from Sero. Files are retained by default.
   * Managed profile files are deleted only with positive stored provenance.
   */
  async remove(id: string, mode: ProfileRemovalMode = 'remove'): Promise<void> {
    if (this.registry.profiles.length <= 1) {
      throw new Error('Cannot remove the only profile');
    }
    if (id === this.registry.activeProfileId) {
      throw new Error('Cannot remove the active profile. Switch to another profile first.');
    }
    const profile = this.findById(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);
    if (mode === 'delete-files' && !canDeleteProfileFiles(profile)) {
      throw new Error('Sero cannot verify that it manages this profile folder.');
    }

    this.registry.profiles = this.registry.profiles.filter((candidate) => candidate.id !== id);
    await writeRegistryAsync(this.registry);
    if (mode === 'delete-files') {
      await fs.rm(profile.path, { recursive: true, force: true });
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  private validateNewProfilePath(candidatePath: string): void {
    if (candidatePath === DEFAULT_PROFILE_PATH && this.registry.profiles.length > 0) {
      throw new Error(
        `${DEFAULT_PROFILE_PATH} is reserved for the first default profile and cannot be reused as a custom profile path.`,
      );
    }

    for (const existing of this.registry.profiles) {
      const existingPath = path.resolve(existing.path);
      if (existingPath === candidatePath) {
        throw new Error(
          `Profile path already belongs to profile "${existing.name}": ${candidatePath}`,
        );
      }

      const candidateInsideExisting = isNestedPath(existingPath, candidatePath);
      const existingInsideCandidate = isNestedPath(candidatePath, existingPath);
      if (!candidateInsideExisting && !existingInsideCandidate) continue;

      if (candidateInsideExisting && isAllowedDefaultProfileContainment(existingPath, candidatePath)) {
        continue;
      }

      throw new Error(
        `Profile path overlaps with existing profile "${existing.name}" at ${existing.path}`,
      );
    }
  }

  /** Generate a default path for a new profile. */
  private defaultPathForName(name: string): string {
    // Source-dev/test isolation roots may already contain scratch data. Keep
    // every created profile under profiles/<slug> so fresh profiles are empty.
    if (process.env.SERO_HOME_OVERRIDE) {
      return defaultManagedPathForName(name, this.registry.profiles);
    }

    // First production profile gets the default SERO_ROOT for migration/back-compat.
    if (this.registry.profiles.length === 0) {
      return DEFAULT_PROFILE_PATH;
    }

    // Subsequent profiles go under ~/.sero-ui/profiles/<slug>/
    const slug = slugForProfileName(name);

    let candidate = path.join(SERO_ROOT, 'profiles', slug);
    let suffix = 1;
    while (this.registry.profiles.some((p) => p.path === candidate)) {
      candidate = path.join(SERO_ROOT, 'profiles', `${slug}-${suffix}`);
      suffix++;
    }
    return candidate;
  }
}

// ── Singleton ───────────────────────────────────────────────

export const profileManager = new ProfileManager();
