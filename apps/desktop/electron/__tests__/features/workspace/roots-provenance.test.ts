import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

// roots.ts is plain TS with no Electron imports — it only depends on
// `WorkspaceManager` as a type, plus its own utils. We can import it
// directly without stubbing anything.
import { addRoot, removeRoot, PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import type { WorkspaceConfig, WorkspaceRoot } from '@/types/ipc';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

interface FakeManagerState {
  entryPath: string;
  config: WorkspaceConfig;
  persisted: WorkspaceConfig[];
}

function makeFakeManager(state: FakeManagerState): WorkspaceManager {
  return {
    findEntry: vi.fn((id: string) =>
      id === 'ws-1' ? { id: 'ws-1', path: state.entryPath } : undefined,
    ),
    readConfig: vi.fn(async () => structuredClone(state.config)),
    persistConfig: vi.fn(async (_id: string, _p: string, cfg: WorkspaceConfig) => {
      // record AND mutate so subsequent calls see the latest state
      state.persisted.push(structuredClone(cfg));
      state.config = structuredClone(cfg);
    }),
    getConfig: vi.fn(async () => structuredClone(state.config)),
    getPath: vi.fn((id: string) => (id === 'ws-1' ? state.entryPath : undefined)),
  } as unknown as WorkspaceManager;
}

describe('roots provenance', () => {
  let tmpRoot: string;
  let primaryDir: string;
  let extraDir: string;
  let sharedDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-roots-test-'));
    primaryDir = path.join(tmpRoot, 'primary');
    extraDir = path.join(tmpRoot, 'extra');
    sharedDir = path.join(tmpRoot, 'shared');
    await mkdir(primaryDir);
    await mkdir(extraDir);
    await mkdir(sharedDir);
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  describe('addRoot', () => {
    it('appends to config.roots without touching config.mounts', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: {
          id: 'ws-1',
          name: 'WS 1',
          mounts: ['/preexisting/user/mount'],
          roots: [],
        },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      const root = await addRoot(mgr, 'ws-1', { name: 'extra', path: extraDir });

      expect(root.path).toBe(extraDir);
      expect(root.kind).toBe('folder');
      expect(state.persisted).toHaveLength(1);
      const saved = state.persisted[0];
      expect(saved.roots).toHaveLength(1);
      expect(saved.roots?.[0].path).toBe(extraDir);
      // Critical: mounts must be byte-for-byte unchanged.
      expect(saved.mounts).toEqual(['/preexisting/user/mount']);
    });

    it('rejects re-adding the workspace primary path as a root', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: { id: 'ws-1', name: 'WS 1', roots: [] },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await expect(
        addRoot(mgr, 'ws-1', { name: 'self', path: primaryDir }),
      ).rejects.toThrow(/own path/);
      expect(state.persisted).toHaveLength(0);
    });

    it('rejects duplicate root paths', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: {
          id: 'ws-1',
          name: 'WS 1',
          roots: [{ id: 'extra', name: 'extra', path: extraDir, kind: 'folder' }],
        },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await expect(
        addRoot(mgr, 'ws-1', { name: 'again', path: extraDir }),
      ).rejects.toThrow(/already attached/);
      expect(state.persisted).toHaveLength(0);
    });

    it('rejects paths that are not directories', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: { id: 'ws-1', name: 'WS 1', roots: [] },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await expect(
        addRoot(mgr, 'ws-1', { name: 'nope', path: path.join(tmpRoot, 'does-not-exist') }),
      ).rejects.toThrow(/Not a directory/);
    });

    it('refuses to assign the reserved primary id even after slugification', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: { id: 'ws-1', name: 'WS 1', roots: [] },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      // Name "workspace" would slugify to PRIMARY_ROOT_ID — the helper
      // must allocate something else.
      const root = await addRoot(mgr, 'ws-1', { name: 'workspace', path: extraDir });

      expect(root.id).not.toBe(PRIMARY_ROOT_ID);
    });

    it('preserves the kind passed by the caller', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: { id: 'ws-1', name: 'WS 1', roots: [] },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      const root = await addRoot(mgr, 'ws-1', {
        name: 'plugin',
        path: extraDir,
        kind: 'linked-plugin',
      });

      expect(root.kind).toBe('linked-plugin');
    });
  });

  describe('removeRoot', () => {
    it('removes the root entry without touching config.mounts', async () => {
      const root: WorkspaceRoot = {
        id: 'extra',
        name: 'extra',
        path: extraDir,
        kind: 'folder',
      };
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: {
          id: 'ws-1',
          name: 'WS 1',
          mounts: ['/some/user/mount'],
          roots: [root],
        },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await removeRoot(mgr, 'ws-1', 'extra');

      expect(state.persisted).toHaveLength(1);
      const saved = state.persisted[0];
      expect(saved.roots).toEqual([]);
      // Critical: mounts must be byte-for-byte unchanged.
      expect(saved.mounts).toEqual(['/some/user/mount']);
    });

    it('does NOT remove a user mount that happens to share a path with a removed root', async () => {
      // This is the regression that the PR review flagged: with the old
      // "mirror into mounts" approach, removing the root would also drop
      // the user-added mount that pointed at the same directory. With
      // the new design, mounts and roots are independent.
      const root: WorkspaceRoot = {
        id: 'shared',
        name: 'shared',
        path: sharedDir,
        kind: 'folder',
      };
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: {
          id: 'ws-1',
          name: 'WS 1',
          mounts: [sharedDir],
          roots: [root],
        },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await removeRoot(mgr, 'ws-1', 'shared');

      const saved = state.persisted[0];
      expect(saved.roots).toEqual([]);
      expect(saved.mounts).toEqual([sharedDir]);
    });

    it('throws when asked to remove the primary root', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: { id: 'ws-1', name: 'WS 1', roots: [] },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await expect(removeRoot(mgr, 'ws-1', PRIMARY_ROOT_ID)).rejects.toThrow(
        /primary workspace root/,
      );
      expect(state.persisted).toHaveLength(0);
    });

    it('is a no-op when the root id is unknown', async () => {
      const state: FakeManagerState = {
        entryPath: primaryDir,
        config: {
          id: 'ws-1',
          name: 'WS 1',
          mounts: ['/x'],
          roots: [{ id: 'a', name: 'a', path: extraDir, kind: 'folder' }],
        },
        persisted: [],
      };
      const mgr = makeFakeManager(state);

      await removeRoot(mgr, 'ws-1', 'does-not-exist');

      // No persistence at all when there's nothing to change.
      expect(state.persisted).toHaveLength(0);
    });
  });
});
