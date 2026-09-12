import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { RtkToolchainResolution } from '@sero-ai/common';
import { defaultOptimizerConfig } from '../../shared/types';
import { computeRewrite } from '../rewrite';

/**
 * Container-backend integration.
 *
 * Opt in with `SERO_E2E_CONTAINER=1` so the default suite does not start a
 * container. Skips when Docker or the Sero node image is unavailable.
 */

const IMAGE = process.env.SERO_E2E_CONTAINER_IMAGE ?? 'ghcr.io/sero-labs/sero-node:latest';
const monorepoRoot = path.resolve(__dirname, '../../../..');
const enabled = process.env.SERO_E2E_CONTAINER === '1';

function dockerAvailable(): boolean {
  return spawnSync('docker', ['image', 'inspect', IMAGE], { encoding: 'utf8' }).status === 0;
}

const describeIfContainer = enabled && dockerAvailable() ? describe : describe.skip;

function resolution(): RtkToolchainResolution {
  return {
    state: 'available',
    version: '0.49.0',
    host: { executablePath: 'rtk', env: {} },
    runtime: { executablePath: '/usr/local/bin/rtk', env: { RTK_DB_PATH: '/tmp/sero-rtk-e2e/history.db' } },
  };
}

describeIfContainer('real RTK on the container backend', () => {
  it('has the pinned runtime executable', () => {
    const result = spawnSync('docker', ['run', '--rm', '--entrypoint', '/usr/local/bin/rtk', IMAGE, '--version'], {
      encoding: 'utf8',
      timeout: 5 * 60 * 1000,
    });
    expect(`${result.stdout}${result.stderr}`).toMatch(/rtk 0\.49\.0/);
  });

  it('executes a bound rewrite inside the container', async () => {
    const outcome = await computeRewrite({
      pi: {} as never,
      command: 'git status',
      resolution: resolution(),
      config: { ...defaultOptimizerConfig(), enabled: true },
      platform: process.platform,
      probe: async (executable, rawCommand) => {
        const result = spawnSync(executable, ['rewrite', rawCommand], { encoding: 'utf8', timeout: 10_000 });
        return { stdout: result.stdout ?? '', code: result.status ?? -1 };
      },
    });

    expect(outcome.state).toBe('rewritten');
    expect(outcome.executed).toContain('/usr/local/bin/rtk');
    expect(outcome.executed).not.toMatch(/(^|\s)rtk\s/);

    const run = spawnSync(
      'docker',
      [
        'run', '--rm',
        '-v', `${monorepoRoot}:/workspace:ro`,
        '-w', '/workspace',
        '--entrypoint', '/bin/sh',
        IMAGE, '-c', outcome.executed,
      ],
      { encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
    );

    // The bound binary ran; a git status in the mounted repository exits 0.
    expect(run.status, run.stderr).toBe(0);
    expect(`${run.stdout}${run.stderr}`.length).toBeGreaterThan(0);
  });
});
