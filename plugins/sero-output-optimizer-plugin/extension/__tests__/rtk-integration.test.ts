import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { RtkToolchainResolution } from '@sero-ai/common';
import { defaultOptimizerConfig } from '../../shared/types';
import { computeRewrite } from '../rewrite';

/**
 * Integration against the real RTK binary on the host.
 *
 * Skips when RTK is not on PATH, so CI without the managed toolchain still
 * passes. This exercises the real rewrite protocol, not a probe double.
 */

const rtkPath = spawnSync('which', ['rtk'], { encoding: 'utf8' }).stdout?.trim();
const describeIfRtk = rtkPath ? describe : describe.skip;

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-optimizer-rtk-'));
afterAll(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

function resolution(): RtkToolchainResolution {
  return {
    state: 'available',
    version: '0.49.0',
    host: { executablePath: rtkPath ?? 'rtk', env: {} },
    runtime: { executablePath: rtkPath ?? 'rtk', env: { RTK_DB_PATH: path.join(stateDir, 'history.db') } },
  };
}

async function rewrite(command: string) {
  return computeRewrite({
    pi: {} as never,
    command,
    resolution: resolution(),
    config: { ...defaultOptimizerConfig(), enabled: true },
    platform: process.platform,
    probe: async (executable, rawCommand) => {
      const result = spawnSync(executable, ['rewrite', rawCommand], { encoding: 'utf8', timeout: 10_000 });
      return { stdout: result.stdout ?? '', code: result.status ?? -1 };
    },
  });
}

describeIfRtk('real RTK rewrite protocol (host)', () => {
  it('rewrites a supported command and binds the runtime executable', async () => {
    const outcome = await rewrite('git status');
    expect(outcome.state).toBe('rewritten');
    expect(outcome.executed).toContain(rtkPath as string);
    expect(outcome.executed).not.toMatch(/(^|\s)rtk\s/);
  });

  it('rewrites a package-manager install', async () => {
    const outcome = await rewrite('pnpm install');
    expect(outcome.state).toBe('rewritten');
    expect(outcome.executed).toContain(rtkPath as string);
  });

  it('does not rewrite a search command that appears inside a pipe', async () => {
    const outcome = await rewrite('git status | grep modified');
    expect(outcome.state).toBe('blocked');
    expect(outcome.executed).toBe('git status | grep modified');
  });

  it('does not rewrite lossy git forms or structured output', async () => {
    expect((await rewrite('git log --oneline')).state).toBe('blocked');
    expect((await rewrite('rg --json foo')).state).toBe('blocked');
  });
});
