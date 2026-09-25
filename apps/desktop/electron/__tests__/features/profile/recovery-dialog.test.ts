import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showItemInFolder: vi.fn(),
  backupAndResetRegistrySync: vi.fn(),
  salvageRegistrySync: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: mocks.showMessageBox,
  },
  shell: {
    showItemInFolder: mocks.showItemInFolder,
  },
}));

vi.mock('@electron/features/profile/registry-recovery', () => ({
  backupAndResetRegistrySync: mocks.backupAndResetRegistrySync,
  salvageRegistrySync: mocks.salvageRegistrySync,
}));

let root = '';
const registryPath = () => path.join(root, 'profiles.json');

async function writeRegistry(profiles: unknown[]): Promise<void> {
  await fs.writeFile(
    registryPath(),
    JSON.stringify({ version: 1, activeProfileId: null, profiles }),
  );
}

async function makeDir(name: string): Promise<string> {
  const full = path.join(root, name);
  await fs.mkdir(full, { recursive: true });
  return full;
}

function makeIssue() {
  return {
    kind: 'malformed_profile_registry' as const,
    registryPath: registryPath(),
    message: 'profiles.json is malformed: Unexpected token',
  };
}

function firstButtons(): string[] {
  return mocks.showMessageBox.mock.calls[0][0].buttons as string[];
}

beforeEach(async () => {
  vi.clearAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-recovery-dialog-'));
  mocks.backupAndResetRegistrySync.mockReturnValue({
    registryPath: registryPath(),
    backupPath: path.join(root, 'profiles.broken-x.json'),
  });
  mocks.salvageRegistrySync.mockReturnValue({
    registryPath: registryPath(),
    backupPath: path.join(root, 'profiles.broken-x.json'),
    kept: 2,
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('handleProfileRegistryRecovery', () => {
  it('resets the registry and requests a relaunch', async () => {
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery(makeIssue());

    expect(result).toBe('relaunch');
    expect(mocks.backupAndResetRegistrySync).toHaveBeenCalledOnce();
    expect(mocks.salvageRegistrySync).not.toHaveBeenCalled();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('lets the user reveal the folder before quitting', async () => {
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValueOnce({ response: 2 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery(makeIssue());

    expect(result).toBe('quit');
    expect(mocks.showItemInFolder).toHaveBeenCalledWith(registryPath());
    expect(mocks.backupAndResetRegistrySync).not.toHaveBeenCalled();
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('keeps the profiles whose directories still exist', async () => {
    const a = await makeDir('a');
    const b = await makeDir('b');
    await writeRegistry([
      { id: 'a', name: 'A', path: a, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'B', path: b, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery(makeIssue());

    expect(result).toBe('relaunch');
    expect(firstButtons()[0]).toMatch(/^Keep 2 existing profiles/);
    expect(mocks.salvageRegistrySync).toHaveBeenCalledOnce();
    const passed = mocks.salvageRegistrySync.mock.calls[0][0] as Array<{ id: string }>;
    expect(passed.map((candidate) => candidate.id).sort()).toEqual(['a', 'b']);
    expect(mocks.backupAndResetRegistrySync).not.toHaveBeenCalled();
  });

  it('offers Reset only when nothing can be kept', async () => {
    await writeRegistry([
      { id: 'gone', name: 'Gone', path: path.join(root, 'missing'), createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery(makeIssue());

    expect(result).toBe('relaunch');
    expect(firstButtons()).toEqual(['Reset and Restart', 'Open Folder', 'Quit']);
    expect(mocks.salvageRegistrySync).not.toHaveBeenCalled();
  });

  it('offers Reset only when the registry cannot be parsed', async () => {
    await fs.writeFile(registryPath(), '{broken-json');
    mocks.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    const { handleProfileRegistryRecovery } = await import('@electron/features/profile/recovery');
    const result = await handleProfileRegistryRecovery(makeIssue());

    expect(result).toBe('relaunch');
    expect(firstButtons()).toEqual(['Reset and Restart', 'Open Folder', 'Quit']);
    expect(mocks.backupAndResetRegistrySync).toHaveBeenCalledOnce();
  });
});
