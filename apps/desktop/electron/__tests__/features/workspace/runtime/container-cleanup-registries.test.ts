import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRegisteredWorkspaceIdentities } from '@electron/features/workspace/runtime/container-cleanup/registries';

const temporaryRoots: string[] = [];

async function createProfile(id: string, workspaces: Array<{ id: string; path: string }>): Promise<{ id: string; path: string }> {
  const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), `sero-profile-${id}-`));
  temporaryRoots.push(profilePath);
  await fs.mkdir(path.join(profilePath, 'agent'), { recursive: true });
  await fs.writeFile(
    path.join(profilePath, 'agent', 'workspaces.json'),
    JSON.stringify({ workspaces }),
    'utf8',
  );
  return { id, path: profilePath };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('registered workspace identity loading', () => {
  it('reads workspace registries from every registered profile', async () => {
    const profileA = await createProfile('profile-a', [{ id: 'one', path: '/workspaces/one' }]);
    const profileB = await createProfile('profile-b', [{ id: 'two', path: '/workspaces/two' }]);

    const result = await readRegisteredWorkspaceIdentities([profileA, profileB]);

    expect(result.complete).toBe(true);
    expect(result.workspaces).toEqual([
      { profileId: 'profile-a', workspaceId: 'one', workspacePath: '/workspaces/one' },
      { profileId: 'profile-b', workspaceId: 'two', workspacePath: '/workspaces/two' },
    ]);
  });

  it('marks reconciliation incomplete when one profile registry is malformed', async () => {
    const profileA = await createProfile('profile-a', [{ id: 'one', path: '/workspaces/one' }]);
    const profileB = await createProfile('profile-b', []);
    await fs.writeFile(path.join(profileB.path, 'agent', 'workspaces.json'), '{broken', 'utf8');

    const result = await readRegisteredWorkspaceIdentities([profileA, profileB]);

    expect(result.complete).toBe(false);
    expect(result.workspaces).toEqual([
      { profileId: 'profile-a', workspaceId: 'one', workspacePath: '/workspaces/one' },
    ]);
  });

  it('fails closed when a registered profile has no workspace registry', async () => {
    const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-profile-missing-registry-'));
    temporaryRoots.push(profilePath);
    await fs.mkdir(path.join(profilePath, 'agent'), { recursive: true });

    const result = await readRegisteredWorkspaceIdentities([
      { id: 'profile-missing', path: profilePath },
    ]);

    expect(result).toEqual({ workspaces: [], complete: false });
  });
});
