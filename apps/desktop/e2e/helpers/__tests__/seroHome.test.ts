import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTempSeroHome,
  seedProfile,
  seedWorkspace,
  type TempSeroHome,
} from '../seroHome';

describe('seroHome helper', () => {
  const created: TempSeroHome[] = [];

  afterEach(() => {
    while (created.length > 0) {
      const home = created.pop();
      home?.cleanup();
    }
  });

  it('createTempSeroHome creates an empty isolated directory', () => {
    const home = createTempSeroHome();
    created.push(home);
    expect(fs.existsSync(home.path)).toBe(true);
    expect(home.path).toMatch(/sero-e2e-/);
    expect(fs.readdirSync(home.path)).toEqual([]);
  });

  it('two consecutive calls produce distinct directories', () => {
    const a = createTempSeroHome();
    const b = createTempSeroHome();
    created.push(a, b);
    expect(a.path).not.toBe(b.path);
  });

  it('cleanup removes the directory recursively', () => {
    const home = createTempSeroHome();
    fs.writeFileSync(path.join(home.path, 'marker.txt'), 'x');
    home.cleanup();
    expect(fs.existsSync(home.path)).toBe(false);
  });

  it('cleanup is idempotent', () => {
    const home = createTempSeroHome();
    home.cleanup();
    expect(() => home.cleanup()).not.toThrow();
  });

  it('seedProfile writes profiles/registry.json and a default profile dir', () => {
    const home = createTempSeroHome();
    created.push(home);
    const profile = seedProfile(home, { name: 'Test' });
    const registry = JSON.parse(
      fs.readFileSync(path.join(home.path, 'profiles', 'registry.json'), 'utf8'),
    );
    expect(registry.activeProfileId).toBe(profile.id);
    expect(registry.profiles).toHaveLength(1);
    expect(registry.profiles[0].name).toBe('Test');
    expect(fs.existsSync(path.join(home.path, 'profiles', profile.id, 'agent'))).toBe(true);
  });

  it('seedWorkspace writes a workspaces.json entry under the active profile', () => {
    const home = createTempSeroHome();
    created.push(home);
    seedProfile(home, { name: 'Test' });
    const wsPath = path.join(home.path, 'sample-repo');
    fs.mkdirSync(wsPath, { recursive: true });
    const ws = seedWorkspace(home, { path: wsPath, name: 'sample' });
    const wsFile = path.join(home.path, 'profiles', home.activeProfileId!, 'workspaces.json');
    const wsJson = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
    expect(wsJson.workspaces).toHaveLength(1);
    expect(wsJson.workspaces[0].id).toBe(ws.id);
    expect(wsJson.workspaces[0].path).toBe(wsPath);
  });
});
