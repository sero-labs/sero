import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// NOTE: Seeded profiles/registry.json is only consulted when the app boots
// WITHOUT SERO_HOME_OVERRIDE. Today's launcher uses SERO_HOME_OVERRIDE for
// isolation; profile-switch tests in Phase 2 will need the launcher's
// `seedMode: 'registry'` option (see app launcher extension in Task 5).

export interface TempSeroHome {
  path: string;
  activeProfileId: string | null;
  cleanup: () => void;
}

export function createTempSeroHome(): TempSeroHome {
  const baseDir = process.platform === 'win32' ? path.join(os.homedir(), '.sero-e2e') : os.tmpdir();
  fs.mkdirSync(baseDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(baseDir, 'sero-e2e-'));
  const handle: TempSeroHome = {
    path: dir,
    activeProfileId: null,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return handle;
}

export interface SeededProfile {
  id: string;
  name: string;
  path: string;
}

export interface SeedProfileOpts {
  name: string;
  id?: string;
}

export function seedProfile(home: TempSeroHome, opts: SeedProfileOpts): SeededProfile {
  const id = opts.id ?? randomUUID();
  const profileRoot = path.join(home.path, 'profiles', id);
  fs.mkdirSync(path.join(profileRoot, 'agent'), { recursive: true });

  const registryPath = path.join(home.path, 'profiles', 'registry.json');
  const existing = readJsonIfExists(registryPath, {
    activeProfileId: null as string | null,
    profiles: [] as Array<{ id: string; name: string; path: string }>,
  });
  existing.profiles.push({ id, name: opts.name, path: profileRoot });
  existing.activeProfileId = id;
  fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2));

  home.activeProfileId = id;
  return { id, name: opts.name, path: profileRoot };
}

export interface SeededWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface SeedWorkspaceOpts {
  path: string;
  name: string;
  id?: string;
  runtimeBackend?: 'host' | 'apple-container' | 'docker';
}

export function seedWorkspace(home: TempSeroHome, opts: SeedWorkspaceOpts): SeededWorkspace {
  if (!home.activeProfileId) {
    throw new Error('seedWorkspace requires seedProfile first');
  }
  const id = opts.id ?? randomUUID();
  const wsFile = path.join(home.path, 'profiles', home.activeProfileId, 'workspaces.json');
  const existing = readJsonIfExists(wsFile, {
    workspaces: [] as Array<{
      id: string;
      name: string;
      path: string;
      runtimeBackend: 'host' | 'apple-container' | 'docker';
    }>,
  });
  existing.workspaces.push({
    id,
    name: opts.name,
    path: opts.path,
    runtimeBackend: opts.runtimeBackend ?? 'host',
  });
  fs.writeFileSync(wsFile, JSON.stringify(existing, null, 2));
  return { id, name: opts.name, path: opts.path };
}

function readJsonIfExists<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
