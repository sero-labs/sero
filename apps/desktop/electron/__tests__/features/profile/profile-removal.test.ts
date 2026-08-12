import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Dynamic imports intentionally reload the startup-bound registry root for each isolated test.

let root = '';
const previousFixedRoot = process.env.SERO_FIXED_ROOT_OVERRIDE;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-profile-removal-'));
  process.env.SERO_FIXED_ROOT_OVERRIDE = root;
  vi.resetModules();
});

afterEach(async () => {
  if (previousFixedRoot === undefined) delete process.env.SERO_FIXED_ROOT_OVERRIDE;
  else process.env.SERO_FIXED_ROOT_OVERRIDE = previousFixedRoot;
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(`${root}-custom`, { recursive: true, force: true });
  vi.resetModules();
});

describe('profile removal modes', () => {
  it('creates an explicit empty workspace registry for a new profile', async () => {
    const { profileManager } = await import('@electron/features/profile/manager');
    const profile = await profileManager.create('Default', undefined, true);

    const registry = JSON.parse(
      await fs.readFile(path.join(profile.path, 'agent', 'workspaces.json'), 'utf8'),
    ) as { workspaces: unknown[] };
    expect(registry.workspaces).toEqual([]);
  });

  it('removes an inactive profile from Sero but retains its files by default', async () => {
    const { profileManager } = await import('@electron/features/profile/manager');
    await profileManager.create('Default', undefined, true);
    const removable = await profileManager.create('Research');
    await fs.writeFile(path.join(removable.path, 'keep.txt'), 'keep', 'utf8');

    await profileManager.remove(removable.id, 'remove');

    expect(profileManager.findById(removable.id)).toBeNull();
    await expect(fs.readFile(path.join(removable.path, 'keep.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('deletes files only for a profile with Sero-managed provenance', async () => {
    const { profileManager } = await import('@electron/features/profile/manager');
    await profileManager.create('Default', undefined, true);
    const removable = await profileManager.create('Research');
    await fs.writeFile(path.join(removable.path, 'delete.txt'), 'delete', 'utf8');

    expect(profileManager.list().find((profile) => profile.id === removable.id)?.canDeleteFiles).toBe(true);
    expect(profileManager.list().find((profile) => profile.isActive)?.canDeleteFiles).toBe(false);
    await profileManager.remove(removable.id, 'delete-files');

    await expect(fs.stat(removable.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects permanent deletion for main, custom, and uncertain legacy folders', async () => {
    const { canDeleteProfileFiles, profileManager } = await import('@electron/features/profile/manager');
    await profileManager.create('Default', undefined, true);
    const customPath = `${root}-custom`;
    const custom = await profileManager.create('Custom', customPath);
    expect(profileManager.list().find((profile) => profile.id === custom.id)?.canDeleteFiles).toBe(false);
    expect(canDeleteProfileFiles({
      id: 'legacy',
      name: 'Legacy',
      path: path.join(root, 'profiles', 'legacy'),
      createdAt: '2026-01-01T00:00:00.000Z',
    })).toBe(false);
    await expect(profileManager.remove(custom.id, 'delete-files')).rejects.toThrow(/cannot verify/i);
    await expect(fs.stat(customPath)).resolves.toBeDefined();
  });

  it('keeps active and sole profile protections', async () => {
    const { profileManager } = await import('@electron/features/profile/manager');
    const active = await profileManager.create('Default', undefined, true);

    await expect(profileManager.remove(active.id, 'remove')).rejects.toThrow(/only profile/i);
    const inactive = await profileManager.create('Research');
    await expect(profileManager.remove(active.id, 'remove')).rejects.toThrow(/active profile/i);
    expect(profileManager.findById(inactive.id)).not.toBeNull();
  });
});
