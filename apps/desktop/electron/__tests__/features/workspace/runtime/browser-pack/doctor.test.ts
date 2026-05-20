import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { SERO_FIXED_ROOT } from '@electron/platform/env';
import { checkBrowserPackDoctor } from '@electron/features/workspace/runtime/browser-pack/doctor';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';

const executable = path.join(SERO_FIXED_ROOT, 'browser-doctor-test', 'chrome');
const adapter: BrowserRuntimeAdapter = {
  browsersPath: path.dirname(executable),
  chromiumExecutableCandidates: [executable],
  ffmpegCandidates: [],
  agentBrowserCandidates: [],
  pathPrefixes: [],
  tempDir: path.join(SERO_FIXED_ROOT, 'browser-doctor-test', 'tmp'),
  env: { PLAYWRIGHT_BROWSERS_PATH: path.dirname(executable) },
};

describe('Browser pack Doctor checks', () => {
  afterEach(async () => {
    await fs.promises.rm(path.join(SERO_FIXED_ROOT, 'browser-doctor-test'), { recursive: true, force: true });
  });

  it('reports installed and launchable as ready', async () => {
    await writeExecutable();

    await expect(checkBrowserPackDoctor({
      status: async () => ({ state: 'ready', manifestVersion: 'test', browsersPath: adapter.browsersPath }),
      adapter,
      launch: async () => undefined,
    })).resolves.toMatchObject({ state: 'ready' });
  });

  it('reports not-installed browser pack as installable', async () => {
    await expect(checkBrowserPackDoctor({
      status: async () => ({ state: 'installable', manifestVersion: 'test' }),
    })).resolves.toMatchObject({ state: 'installable' });
  });

  it('reports unavailable browser pack artifacts as missing', async () => {
    await expect(checkBrowserPackDoctor({
      status: async () => ({
        state: 'missing',
        manifestVersion: 'test',
        artifactKey: 'browser-linux-arm64',
        error: { code: 'BROWSER_PACK_UNAVAILABLE', message: 'not available yet', retryable: false, installable: false },
      }),
    })).resolves.toMatchObject({ state: 'missing', message: 'not available yet' });
  });

  it('reports failed install state', async () => {
    await expect(checkBrowserPackDoctor({
      status: async () => ({
        state: 'failed',
        manifestVersion: 'test',
        error: { code: 'BROWSER_PACK_INSTALL_FAILED', message: 'digest mismatch', retryable: true, installable: true },
      }),
    })).resolves.toMatchObject({ state: 'failed', message: 'digest mismatch' });
  });

  it('reports Linux shared library failures with actionable container fallback detail', async () => {
    await writeExecutable();

    await expect(checkBrowserPackDoctor({
      platform: 'linux',
      status: async () => ({ state: 'ready', manifestVersion: 'test', browsersPath: adapter.browsersPath }),
      adapter,
      launch: async () => {
        throw new Error('error while loading shared libraries: libnss3.so: cannot open shared object file');
      },
    })).resolves.toMatchObject({
      state: 'failed',
      details: {
        reason: 'linux-shared-libraries-missing',
        remediationAction: 'browserPack.showLinuxDependencies',
        containerFallback: true,
      },
    });
  });
});

async function writeExecutable(): Promise<void> {
  await fs.promises.mkdir(path.dirname(executable), { recursive: true });
  await fs.promises.writeFile(executable, '#!/bin/sh\necho Chromium\n', { mode: 0o755 });
}
