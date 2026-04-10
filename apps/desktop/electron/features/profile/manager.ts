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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import type { ProfileEntry, ProfileRegistry, ProfileInfo } from './types';

/** Fixed location for the profile registry — never changes. */
const SERO_ROOT = path.join(os.homedir(), '.sero-ui');
const REGISTRY_PATH = path.join(SERO_ROOT, 'profiles.json');

/** Default SERO_HOME for the auto-created "Default" profile. */
const DEFAULT_PROFILE_PATH = SERO_ROOT;

// ── Registry I/O ────────────────────────────────────────────

function emptyRegistry(): ProfileRegistry {
  return { version: 1, activeProfileId: null, profiles: [] };
}

/** Read registry synchronously. Returns empty registry if missing/corrupt. */
export function readRegistrySync(): ProfileRegistry {
  try {
    if (!existsSync(REGISTRY_PATH)) return emptyRegistry();
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ProfileRegistry;
    if (!parsed || !Array.isArray(parsed.profiles)) return emptyRegistry();
    return { ...emptyRegistry(), ...parsed };
  } catch {
    return emptyRegistry();
  }
}

/** Write registry synchronously. */
function writeRegistrySync(registry: ProfileRegistry): void {
  mkdirSync(SERO_ROOT, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

/** Write registry asynchronously (for non-critical-path mutations). */
async function writeRegistryAsync(registry: ProfileRegistry): Promise<void> {
  await fs.mkdir(SERO_ROOT, { recursive: true });
  const tmpFile = `${REGISTRY_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  await fs.rename(tmpFile, REGISTRY_PATH);
}

// ── ProfileManager ──────────────────────────────────────────

class ProfileManager {
  private registry: ProfileRegistry;

  constructor() {
    this.registry = readRegistrySync();
  }

  /** Reload registry from disk (e.g. after external modification). */
  reload(): void {
    this.registry = readRegistrySync();
  }

  // ── Queries ─────────────────────────────────────────────

  /** Get all profiles as renderer-safe ProfileInfo objects. */
  list(): ProfileInfo[] {
    return this.registry.profiles.map((p) => ({
      ...p,
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

    // Ensure the profile directory exists
    await fs.mkdir(resolvedPath, { recursive: true });
    await fs.mkdir(path.join(resolvedPath, 'agent'), { recursive: true });

    const entry: ProfileEntry = {
      id,
      name: name.trim(),
      path: resolvedPath,
      createdAt: new Date().toISOString(),
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
   * Delete a profile from the registry.
   * Does NOT delete files on disk — just unregisters it.
   * Cannot delete the last/active profile.
   */
  async delete(id: string): Promise<void> {
    if (this.registry.profiles.length <= 1) {
      throw new Error('Cannot delete the only profile');
    }
    if (id === this.registry.activeProfileId) {
      throw new Error('Cannot delete the active profile. Switch to another profile first.');
    }

    this.registry.profiles = this.registry.profiles.filter((p) => p.id !== id);
    await writeRegistryAsync(this.registry);
  }

  // ── Helpers ─────────────────────────────────────────────

  /** Generate a default path for a new profile. */
  private defaultPathForName(name: string): string {
    // First profile gets the default SERO_ROOT
    if (this.registry.profiles.length === 0) {
      return DEFAULT_PROFILE_PATH;
    }

    // Subsequent profiles go under ~/.sero-ui/profiles/<slug>/
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'profile';

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
