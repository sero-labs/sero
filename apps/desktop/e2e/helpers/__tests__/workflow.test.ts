import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempSeroHome, type TempSeroHome } from '../seroHome';
import { createWorkspaceDir, seedWorkflowProfile } from '../workflow';

describe('workflow helpers', () => {
  const homes: TempSeroHome[] = [];

  afterEach(() => {
    while (homes.length > 0) {
      homes.pop()?.cleanup();
    }
  });

  it('createWorkspaceDir creates a workspace with nested files', () => {
    const home = createTempSeroHome();
    homes.push(home);

    const dir = createWorkspaceDir(home.path, 'sample repo', {
      'README.md': '# sample\n',
      'src/index.ts': 'export const ok = true;\n',
    });

    expect(dir).toBe(path.join(home.path, 'sample repo'));
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('# sample\n');
    expect(fs.readFileSync(path.join(dir, 'src', 'index.ts'), 'utf8')).toContain('ok');
  });

  it('seedWorkflowProfile writes the current profiles.json registry shape', () => {
    const home = createTempSeroHome();
    homes.push(home);

    const profile = seedWorkflowProfile(home, {
      id: 'profile-test',
      name: 'Workflow Profile',
      onboarded: true,
    });

    const registryPath = path.join(home.path, '.sero-ui', 'profiles.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    expect(home.activeProfileId).toBe('profile-test');
    expect(profile).toEqual(expect.objectContaining({
      id: 'profile-test',
      name: 'Workflow Profile',
      path: path.join(home.path, '.sero-ui'),
      onboarded: true,
    }));
    expect(registry).toEqual(expect.objectContaining({
      version: 1,
      activeProfileId: 'profile-test',
      profiles: [expect.objectContaining({
        id: 'profile-test',
        name: 'Workflow Profile',
        path: path.join(home.path, '.sero-ui'),
        onboarded: true,
      })],
    }));
    expect(fs.existsSync(path.join(home.path, '.sero-ui', 'agent'))).toBe(true);
  });
});
