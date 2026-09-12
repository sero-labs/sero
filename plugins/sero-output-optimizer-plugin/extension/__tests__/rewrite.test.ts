import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { RtkToolchainResolution } from '@sero-ai/common';
import { describe, expect, it, vi } from 'vitest';

import { defaultOptimizerConfig, type OutputOptimizerConfig } from '../../shared/types';
import { computeRewrite, type RewriteInput } from '../rewrite';
import { isNestedCall } from '../nested';

function resolution(overrides: Partial<RtkToolchainResolution> = {}): RtkToolchainResolution {
  return {
    state: 'available',
    version: '0.49.0',
    host: { executablePath: '/host/bin/rtk', env: {} },
    runtime: { executablePath: '/runtime/bin/rtk', env: { RTK_DB_PATH: '/state/history.db' } },
    ...overrides,
  };
}

function enabledConfig(overrides: Partial<OutputOptimizerConfig> = {}): OutputOptimizerConfig {
  return { ...defaultOptimizerConfig(), enabled: true, ...overrides };
}

async function run(
  command: string,
  probe: RewriteInput['probe'],
  options: { resolution?: RtkToolchainResolution; config?: OutputOptimizerConfig; platform?: string } = {},
): Promise<Awaited<ReturnType<typeof computeRewrite>>> {
  return computeRewrite({
    pi: {} as ExtensionAPI,
    command,
    resolution: options.resolution ?? resolution(),
    config: options.config ?? enabledConfig(),
    platform: options.platform ?? 'darwin',
    probe,
  });
}

describe('computeRewrite', () => {
  it('rewrites and binds on exit code 0', async () => {
    const outcome = await run('git status', async () => ({ stdout: 'rtk git status', code: 0 }));
    expect(outcome.state).toBe('rewritten');
    expect(outcome.executed).toBe("RTK_DB_PATH='/state/history.db' '/runtime/bin/rtk' git status");
  });

  it('rewrites on exit code 3', async () => {
    const outcome = await run('git status', async () => ({ stdout: 'rtk git status', code: 3 }));
    expect(outcome.state).toBe('rewritten');
  });

  it('treats exit code 1 as no rewrite', async () => {
    const outcome = await run('echo hi', async () => ({ stdout: '', code: 1 }));
    expect(outcome.state).toBe('unchanged');
  });

  it('treats exit code 2 as an upstream decline', async () => {
    const outcome = await run('git push', async () => ({ stdout: '', code: 2 }));
    expect(outcome.state).toBe('declined');
    expect(outcome.executed).toBe('git push');
  });

  it('fails open on an unexpected exit code', async () => {
    const outcome = await run('git status', async () => ({ stdout: 'rtk git status', code: 9 }));
    expect(outcome.state).toBe('failed');
    expect(outcome.executed).toBe('git status');
  });

  it('fails open when the probe throws', async () => {
    const outcome = await run('git status', async () => { throw new Error('boom'); });
    expect(outcome.state).toBe('failed');
    expect(outcome.executed).toBe('git status');
  });

  it('fails open when RTK is unavailable', async () => {
    const outcome = await run(
      'git status',
      async () => ({ stdout: 'rtk git status', code: 0 }),
      { resolution: { state: 'installing', reason: 'installing' } },
    );
    expect(outcome.state).toBe('unavailable');
    expect(outcome.executed).toBe('git status');
  });

  it('discards the whole rewrite when one affected class is disabled', async () => {
    const config = enabledConfig({
      rewriteClasses: { ...enabledConfig().rewriteClasses, fileReads: false },
    });
    const outcome = await run('cat a.txt && ls', async () => ({ stdout: 'rtk read a.txt && rtk ls', code: 0 }), { config });
    expect(outcome.state).toBe('blocked');
    expect(outcome.executed).toBe('cat a.txt && ls');
  });

  it('does not probe an excluded search command', async () => {
    const probe = vi.fn(async () => ({ stdout: 'git status | rtk grep modified', code: 0 }));
    const outcome = await run('git status | grep modified', probe);
    expect(outcome.state).toBe('blocked');
    expect(probe).not.toHaveBeenCalled();
  });

  it('does not rewrite lossy git forms', async () => {
    for (const command of ['git log --oneline', 'git diff', 'git show HEAD']) {
      const probe = vi.fn(async () => ({ stdout: 'rtk git log', code: 0 }));
      const outcome = await run(command, probe);
      expect(outcome.state).toBe('blocked');
      expect(probe).not.toHaveBeenCalled();
    }
  });

  it('skips a Windows top-level pipe', async () => {
    const probe = vi.fn(async () => ({ stdout: 'rtk git status | rtk tail', code: 0 }));
    const outcome = await run('git status | tail -5', probe, { platform: 'win32' });
    expect(outcome.state).toBe('blocked');
    expect(probe).not.toHaveBeenCalled();
  });

  it('does not rewrite structured output', async () => {
    const probe = vi.fn(async () => ({ stdout: 'rtk rg --json foo', code: 0 }));
    const outcome = await run('rg --json foo', probe);
    expect(outcome.state).toBe('blocked');
    expect(probe).not.toHaveBeenCalled();
  });

  it('honours the single-command bypass', async () => {
    const probe = vi.fn(async () => ({ stdout: 'rtk git status', code: 0 }));
    const outcome = await run('git status # no-opt', probe);
    expect(outcome.state).toBe('blocked');
    expect(probe).not.toHaveBeenCalled();
  });

  it('treats an unchanged rewrite as unchanged', async () => {
    const outcome = await run('git status', async () => ({ stdout: 'git status', code: 0 }));
    expect(outcome.state).toBe('unchanged');
  });
});

describe('nested call suppression', () => {
  it('recognises the reserved prefix', () => {
    expect(isNestedCall('run_code_abc')).toBe(true);
    expect(isNestedCall('call_abc')).toBe(false);
  });
});
