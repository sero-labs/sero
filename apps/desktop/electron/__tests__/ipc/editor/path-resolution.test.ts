import { describe, expect, it } from 'vitest';

import {
  PRIMARY_ROOT_PREFIX,
  toContainerPath,
  toHostPath,
} from '@electron/ipc/editor/path-resolution';

function makeManager() {
  const primary = '/Users/dan/workspaces/current';
  const roots = new Map([
    ['workspace', primary],
    ['plugin-source', '/Users/dan/code/sero-plugin'],
  ]);

  return {
    getPath: (workspaceId: string) => (workspaceId === 'ws-1' ? primary : undefined),
    resolveRootPath: async (workspaceId: string, rootId: string) => {
      if (workspaceId !== 'ws-1') return null;
      return roots.get(rootId) ?? null;
    },
  };
}

describe('editor path resolution', () => {
  it('maps safe primary-root paths into /workspace for containers', async () => {
    const containerPath = await toContainerPath(makeManager(), 'ws-1', '/workspace/src/index.ts');
    expect(containerPath).toBe('/workspace/src/index.ts');
  });

  it('maps safe linked-root paths to their bind-mounted host path in containers', async () => {
    const containerPath = await toContainerPath(makeManager(), 'ws-1', '/plugin-source/src/index.ts');
    expect(containerPath).toBe('/Users/dan/code/sero-plugin/src/index.ts');
  });

  it('maps legacy relative paths under the primary root', async () => {
    const hostPath = await toHostPath(makeManager(), 'ws-1', 'src/index.ts');
    const containerPath = await toContainerPath(makeManager(), 'ws-1', 'src/index.ts');

    expect(hostPath).toBe('/Users/dan/workspaces/current/src/index.ts');
    expect(containerPath).toBe('/workspace/src/index.ts');
  });

  it('maps primary-root host absolute paths back into the workspace virtual root', async () => {
    const hostPath = '/Users/dan/workspaces/current/sero-recordings/recording.mp4';

    await expect(toHostPath(makeManager(), 'ws-1', hostPath)).resolves.toBe(hostPath);
    await expect(toContainerPath(makeManager(), 'ws-1', hostPath)).resolves.toBe(
      '/workspace/sero-recordings/recording.mp4',
    );
  });

  it('rejects traversal outside the primary root in container mode', async () => {
    await expect(
      toContainerPath(makeManager(), 'ws-1', `${PRIMARY_ROOT_PREFIX}/../../etc/passwd`),
    ).rejects.toThrow(/escapes workspace/);
  });

  it('rejects traversal from a linked root into a sibling mount', async () => {
    await expect(
      toContainerPath(makeManager(), 'ws-1', '/plugin-source/../../../../../workspace/package.json'),
    ).rejects.toThrow(/escapes workspace/);
  });

  it('rejects rooted paths that reference an unknown root id', async () => {
    await expect(
      toHostPath(makeManager(), 'ws-1', '/missing-root/file.txt'),
    ).rejects.toThrow(/Unknown workspace root/);
  });
});
