import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

export interface TempSeroHome {
  path: string;
  activeProfileId: string | null;
  cleanup: () => void;
}

const DESKTOP_ROOT = path.resolve(__dirname, '../..');
export const E2E_DATA_ROOT = process.platform === 'win32'
  ? path.join(os.homedir(), '.sero-e2e')
  : path.join(DESKTOP_ROOT, '.sero-e2e');
const LEGACY_E2E_DATA_ROOTS = [
  path.join(DESKTOP_ROOT, '.sero-test-data'),
  path.join(DESKTOP_ROOT, '.sero-layout-test'),
];

export function cleanupE2eDataRoot(): void {
  fs.rmSync(E2E_DATA_ROOT, { recursive: true, force: true });
  for (const legacyRoot of LEGACY_E2E_DATA_ROOTS) {
    fs.rmSync(legacyRoot, { recursive: true, force: true });
  }
}

export function createTempSeroHome(): TempSeroHome {
  fs.mkdirSync(E2E_DATA_ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(E2E_DATA_ROOT, 'home-'));
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

  const registryPath = path.join(home.path, 'profiles.json');
  const existing = readJsonIfExists(registryPath, {
    version: 1,
    activeProfileId: null as string | null,
    profiles: [] as Array<{ id: string; name: string; path: string; createdAt: string; onboarded: boolean }>,
  });
  existing.profiles.push({
    id,
    name: opts.name,
    path: profileRoot,
    createdAt: new Date().toISOString(),
    onboarded: true,
  });
  existing.activeProfileId = id;
  fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2) + '\n');

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
  const wsFile = path.join(home.path, 'profiles', home.activeProfileId, 'agent', 'workspaces.json');
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
