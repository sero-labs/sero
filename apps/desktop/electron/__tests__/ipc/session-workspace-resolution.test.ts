import { describe, expect, it, vi } from 'vitest';
import { resolveSessionWorkspaceId } from '@electron/ipc/agent/handlers/sessions';

function resolver(options: {
  registryId?: string;
  configId?: string;
}) {
  return {
    findByPath: vi.fn(() => options.registryId ? { id: options.registryId } : undefined),
    readConfig: vi.fn(async () => options.configId ? { id: options.configId } : null),
  };
}

describe('session workspace resolution', () => {
  it('uses registered workspace paths first', async () => {
    const workspaceResolver = resolver({ registryId: 'current-workspace', configId: 'stale-config' });

    await expect(resolveSessionWorkspaceId('/workspace/current', workspaceResolver)).resolves.toBe('current-workspace');
    expect(workspaceResolver.readConfig).not.toHaveBeenCalled();
  });

  it('keeps removed workspace sessions attached to their config workspace id', async () => {
    const workspaceResolver = resolver({ configId: 'removed-workspace' });

    await expect(resolveSessionWorkspaceId('/workspace/removed', workspaceResolver)).resolves.toBe('removed-workspace');
    expect(workspaceResolver.readConfig).toHaveBeenCalledWith('/workspace/removed');
  });

  it('does not re-home unknown workspace sessions into global', async () => {
    const workspaceResolver = resolver({});

    const workspaceId = await resolveSessionWorkspaceId('/workspace/deleted', workspaceResolver);

    expect(workspaceId).toMatch(/^detached:/);
    expect(workspaceId).not.toBe('global');
  });
});
