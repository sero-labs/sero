import { afterEach, describe, expect, it, vi } from 'vitest';

describe('buildSeroLogMounts', () => {
  afterEach(() => {
    vi.doUnmock('@electron/platform/env');
    vi.resetModules();
  });

  it('does not mount the same host log directory twice for the default profile', async () => {
    vi.doMock('@electron/platform/env', () => ({
      SERO_AGENT_DIR: '/tmp/sero-root/agent',
      SERO_FIXED_ROOT: '/tmp/sero-root',
      SERO_HOME: '/tmp/sero-root',
    }));

    const { buildSeroLogMounts } = await import('@electron/features/container/core/log-access');
    const mounts = buildSeroLogMounts();

    expect(mounts).toEqual([
      { source: '/tmp/sero-root/logs', target: '/workspace/.sero/logs/dev', readonly: true },
      { source: '/tmp/sero-root/debug', target: '/workspace/.sero/logs/debug', readonly: true },
      { source: '/tmp/sero-root/apps', target: '/workspace/.sero/logs/apps', readonly: true },
      { source: '/tmp/sero-root/agent/sessions', target: '/workspace/.sero/logs/sessions', readonly: true },
    ]);
  });
});
