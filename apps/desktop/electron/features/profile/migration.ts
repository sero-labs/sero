/**
 * Profile migration — auto-enrolls existing ~/.sero-ui/ installations.
 *
 * Called synchronously during env.ts bootstrap, before any SDK imports.
 *
 * ⚠️  This module is imported by env.ts at process startup.
 *     Do NOT import anything that reads SERO_HOME or SERO_AGENT_DIR at
 *     module level — those are not yet initialised when this runs.
 *
 * Migration logic:
 * 1. If profiles.json exists → nothing to do (already migrated)
 * 2. If ~/.sero-ui/agent/ exists → existing user, create "Default" profile
 * 3. If nothing exists → fresh install, profiles.json not created
 *    (the renderer will show the ProfileSetup screen)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import type { ProfileRegistry } from './types';

const SERO_ROOT = path.join(os.homedir(), '.sero-ui');
const REGISTRY_PATH = path.join(SERO_ROOT, 'profiles.json');
const AGENT_DIR = path.join(SERO_ROOT, 'agent');

/**
 * Run migration synchronously. Safe to call multiple times — it's idempotent.
 *
 * @returns The path to the active profile's SERO_HOME, or null if no
 *          profile exists (fresh install → show setup screen).
 */
export function migrateExistingInstall(): string | null {
  // Already migrated
  if (existsSync(REGISTRY_PATH)) {
    return null; // Let readRegistrySync handle it normally
  }

  // Check for existing installation
  if (!existsSync(AGENT_DIR)) {
    // Fresh install — no migration needed, no profiles.json created.
    // The renderer will show the ProfileSetup screen.
    return null;
  }

  // Existing user — create a "Default" profile pointing to ~/.sero-ui/
  console.log('[sero:profile] Migrating existing installation to profile system');

  const registry: ProfileRegistry = {
    version: 1,
    activeProfileId: randomUUID(),
    profiles: [
      {
        id: '', // Will be set below
        name: 'Default',
        path: SERO_ROOT,
        createdAt: new Date().toISOString(),
        folderProvenance: 'default-root',
      },
    ],
  };
  // Set the ID to match activeProfileId
  registry.profiles[0].id = registry.activeProfileId!;
  // Migrated profiles are already set up — skip onboarding
  registry.profiles[0].onboarded = true;

  mkdirSync(SERO_ROOT, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');

  console.log('[sero:profile] Created Default profile →', SERO_ROOT);
  return SERO_ROOT;
}
