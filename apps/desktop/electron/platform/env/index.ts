/**
 * Load environment variables from the active profile's agent/.env and set
 * PI_CODING_AGENT_DIR so the Pi SDK resolves all config from Sero's
 * own agent directory instead of ~/.pi/agent.
 *
 * Simple KEY=VALUE parser. Supports:
 *   - Lines with KEY=VALUE (no spaces around =)
 *   - Quoted values: KEY="value" or KEY='value'
 *   - Comments (#) and blank lines
 *   - Does NOT override existing env vars (except SERO_HOME / PI_CODING_AGENT_DIR)
 *
 * Call this before any SDK imports that read process.env.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { migrateExistingInstall } from '@electron/features/profile/migration';
import {
  PROFILE_REGISTRY_PATH,
  readRegistryLoadSync,
  readRegistrySync,
} from '@electron/features/profile/manager';
import type { ProfileRegistry } from '@electron/features/profile/types';
import type { ProfileRegistryStartupIssue } from '@electron/features/profile/recovery';

// ── Fixed root — always ~/.sero-ui/ ─────────────────────────

/** The fixed Sero root directory. profiles.json always lives here. */
export const SERO_FIXED_ROOT = path.join(os.homedir(), '.sero-ui');

// ── Profile-aware SERO_HOME resolution ──────────────────────

/**
 * Resolve the active profile's SERO_HOME.
 *
 * Priority:
 * 1. SERO_HOME_OVERRIDE env var (testing only — never set by Sero itself)
 * 2. Active profile from profiles.json
 * 3. Migration of existing install
 * 4. Fallback to ~/.sero-ui/ (fresh install, pre-setup)
 *
 * NOTE: We deliberately do NOT check process.env.SERO_HOME here.
 * loadSeroEnv() sets SERO_HOME for extensions to read, and app.relaunch()
 * inherits env vars from the parent process. If we checked SERO_HOME,
 * profile switching would be silently ignored after a relaunch.
 */
let profileStartupIssue: ProfileRegistryStartupIssue | null = null;

interface ResolvedSeroEnv {
  seroHome: string;
  seroAgentDir: string;
  authJsonPath: string;
  activeProfileId: string | null;
  envPath: string;
  startupIssue: ProfileRegistryStartupIssue | null;
}

function loadRegistryForStartup(): ProfileRegistry {
  const result = readRegistryLoadSync();
  if (result.error) {
    if (!profileStartupIssue) {
      profileStartupIssue = {
        kind: 'malformed_profile_registry',
        registryPath: PROFILE_REGISTRY_PATH,
        message: result.error.message,
      };
      console.error('[sero:profile] Malformed profiles.json detected:', result.error.message);
    }
  }
  return result.registry;
}

/** Find the Default profile (at SERO_FIXED_ROOT), or the first profile. */
function findDefaultProfile(
  registry: ReturnType<typeof readRegistrySync>,
): { id: string; path: string } | null {
  if (registry.profiles.length === 0) return null;

  const defaultProfile = registry.profiles.find(
    (profile) => profile.path === SERO_FIXED_ROOT,
  );
  if (defaultProfile) return defaultProfile;

  return registry.profiles[0];
}

/** Write repaired activeProfileId back to profiles.json. */
function repairActiveProfile(
  registry: ReturnType<typeof readRegistrySync>,
  id: string,
): void {
  try {
    registry.activeProfileId = id;
    const registryPath = path.join(SERO_FIXED_ROOT, 'profiles.json');
    mkdirSync(SERO_FIXED_ROOT, { recursive: true });
    writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    console.log(`[sero:profile] Repaired activeProfileId → ${id}`);
  } catch (error) {
    console.error('[sero:profile] Failed to repair profiles.json:', error);
  }
}

function resolveProfileHomeFromRegistry(): string {
  migrateExistingInstall();

  const registry = loadRegistryForStartup();
  if (registry.activeProfileId) {
    const active = registry.profiles.find(
      (profile) => profile.id === registry.activeProfileId,
    );
    if (active) {
      return active.path;
    }
    console.warn(
      `[sero:profile] activeProfileId "${registry.activeProfileId}" not found in profiles — falling back to Default`,
    );
  }

  const fallback = findDefaultProfile(registry);
  if (fallback) {
    repairActiveProfile(registry, fallback.id);
    return fallback.path;
  }

  return SERO_FIXED_ROOT;
}

function resolveSeroHome(): string {
  if (process.env.SERO_HOME_OVERRIDE) {
    return process.env.SERO_HOME_OVERRIDE;
  }
  return resolveProfileHomeFromRegistry();
}

function readPostResolveRegistry(seroHome: string): {
  activeProfileId: string | null;
  profiles: Array<{ id: string }>;
} {
  if (process.env.SERO_HOME_OVERRIDE || seroHome === process.env.SERO_HOME_OVERRIDE) {
    return { activeProfileId: null, profiles: [] };
  }
  return loadRegistryForStartup();
}

function resolveStartupEnv(): ResolvedSeroEnv {
  const seroHome = resolveSeroHome();
  const seroAgentDir = path.join(seroHome, 'agent');
  const envPath = path.join(seroAgentDir, '.env');
  const postResolveRegistry = readPostResolveRegistry(seroHome);

  return {
    seroHome,
    seroAgentDir,
    authJsonPath: path.join(seroAgentDir, 'auth.json'),
    activeProfileId: postResolveRegistry.activeProfileId,
    envPath,
    startupIssue: profileStartupIssue,
  };
}

function applyProcessEnv(seroHome: string, seroAgentDir: string): void {
  // ── Redirect the Pi SDK to Sero's agent directory ──────────
  // This MUST happen before any SDK module is imported. The SDK reads
  // PI_CODING_AGENT_DIR at module-load time via getAgentDir().
  process.env.PI_CODING_AGENT_DIR = seroAgentDir;

  // ── Expose SERO_HOME for extensions ────────────────────────
  // Global-scoped app extensions use this to resolve their state
  // path (~/.sero-ui/apps/<appId>/state.json) instead of cwd.
  process.env.SERO_HOME = seroHome;
}

function loadProfileDotEnv(envPath: string): void {
  let content: string;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const resolvedEnv = resolveStartupEnv();

/** Sero's root config directory for the active profile. */
export const SERO_HOME = resolvedEnv.seroHome;

/** Sero's agent directory — replaces ~/.pi/agent for all SDK calls. */
export const SERO_AGENT_DIR = resolvedEnv.seroAgentDir;

/** Path to auth.json (API keys + OAuth tokens). Used for permission hardening. */
export const AUTH_JSON_PATH = resolvedEnv.authJsonPath;

/** The active profile ID (null if no profile yet). */
export const ACTIVE_PROFILE_ID: string | null = resolvedEnv.activeProfileId;

/** Non-null when startup was forced into recovery mode for a broken profiles.json. */
export const PROFILE_STARTUP_ISSUE = resolvedEnv.startupIssue;

export function loadSeroEnv(): void {
  applyProcessEnv(resolvedEnv.seroHome, resolvedEnv.seroAgentDir);
  loadProfileDotEnv(resolvedEnv.envPath);
}
