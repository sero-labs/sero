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

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

import { migrateExistingInstall } from './profile/migration';
import { readRegistrySync } from './profile/manager';

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
function resolveProfileHome(): string {
  // Testing override — uses a SEPARATE env var that Sero never sets itself
  if (process.env.SERO_HOME_OVERRIDE) {
    return process.env.SERO_HOME_OVERRIDE;
  }

  // Run migration for existing users (creates profiles.json if needed)
  migrateExistingInstall();

  // Read profile registry
  const registry = readRegistrySync();

  if (registry.activeProfileId) {
    const active = registry.profiles.find(
      (p) => p.id === registry.activeProfileId,
    );
    if (active) {
      return active.path;
    }
    // activeProfileId doesn't match any profile — stale/deleted entry.
    // Fall through to the default-profile fallback below.
    console.warn(
      `[sero:profile] activeProfileId "${registry.activeProfileId}" not found in profiles — falling back to Default`,
    );
  }

  // No valid active profile — try to fall back to the Default profile
  // (the one at ~/.sero-ui, created by migration). If found, auto-repair
  // the registry so subsequent launches don't hit this path again.
  const fallback = findDefaultProfile(registry);
  if (fallback) {
    repairActiveProfile(registry, fallback.id);
    return fallback.path;
  }

  // No profiles at all — fresh install.
  // The renderer will show the ProfileSetup screen.
  return SERO_FIXED_ROOT;
}

// ── Helpers ─────────────────────────────────────────────────

/** Find the Default profile (at SERO_FIXED_ROOT), or the first profile. */
function findDefaultProfile(
  registry: ReturnType<typeof readRegistrySync>,
): { id: string; path: string } | null {
  if (registry.profiles.length === 0) return null;

  // Prefer the profile at the canonical default path
  const defaultProfile = registry.profiles.find(
    (p) => p.path === SERO_FIXED_ROOT,
  );
  if (defaultProfile) return defaultProfile;

  // Otherwise fall back to the first profile in the list
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
  } catch (err) {
    console.error('[sero:profile] Failed to repair profiles.json:', err);
  }
}

/** Sero's root config directory for the active profile. */
export const SERO_HOME = resolveProfileHome();

/** Sero's agent directory — replaces ~/.pi/agent for all SDK calls. */
export const SERO_AGENT_DIR = path.join(SERO_HOME, 'agent');

// Re-read the registry ONCE (not per-constant) after resolveProfileHome()
// has run any auto-repair. This avoids 3× synchronous file reads at startup.
const _postResolveRegistry = process.env.SERO_HOME_OVERRIDE
  ? { activeProfileId: null as string | null, profiles: [] as { id: string }[] }
  : readRegistrySync();

/** The active profile ID (null if no profile yet). */
export const ACTIVE_PROFILE_ID: string | null = _postResolveRegistry.activeProfileId;

/** Whether the app has a valid active profile. */
export const HAS_ACTIVE_PROFILE: boolean =
  _postResolveRegistry.profiles.length > 0 && _postResolveRegistry.activeProfileId !== null;

const ENV_PATH = path.join(SERO_AGENT_DIR, '.env');

export function loadSeroEnv(): void {
  // ── Redirect the Pi SDK to Sero's agent directory ──────────
  // This MUST happen before any SDK module is imported. The SDK reads
  // PI_CODING_AGENT_DIR at module-load time via getAgentDir().
  //
  // Always overwrite — after app.relaunch() the inherited env may point
  // to the previous profile's agent directory.
  process.env.PI_CODING_AGENT_DIR = SERO_AGENT_DIR;

  // ── Expose SERO_HOME for extensions ────────────────────────
  // Global-scoped app extensions use this to resolve their state
  // path (~/.sero-ui/apps/<appId>/state.json) instead of cwd.
  //
  // Always overwrite — same relaunch inheritance concern.
  process.env.SERO_HOME = SERO_HOME;

  // ── Load .env file ────────────────────────────────────────
  let content: string;
  try {
    content = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // File doesn't exist yet — that's fine
    return;
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
