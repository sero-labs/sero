import { execFile } from 'child_process';
import { promisify } from 'util';

import { createBrowserRuntimeAdapter, firstExistingCandidate } from './adapter';
import type { BrowserRuntimeAdapterOptions } from './adapter';
import { createBrowserPackInstaller } from './installer';
import type { BrowserPackInstallerOptions } from './installer';
import type { BrowserDoctorResult, BrowserPackStatus, BrowserRuntimeAdapter } from './types';

const execFileAsync = promisify(execFile);

export interface BrowserPackDoctorOptions extends BrowserPackInstallerOptions, BrowserRuntimeAdapterOptions {
  status?: () => Promise<BrowserPackStatus>;
  adapter?: BrowserRuntimeAdapter;
  launch?: (executable: string, env: Record<string, string>) => Promise<void>;
}

export async function checkBrowserPackDoctor(options: BrowserPackDoctorOptions = {}): Promise<BrowserDoctorResult> {
  const status = options.status ? await options.status() : await createBrowserPackInstaller(options).status();
  if (status.state === 'installing') return { state: 'installing', message: 'Host browser automation pack is installing.' };
  if (status.state === 'missing') return { state: 'missing', message: status.error?.message ?? 'Host browser automation pack is not available for this machine yet.', details: status.error?.details };
  if (status.state === 'failed') return { state: 'failed', message: status.error?.message ?? 'Host browser automation pack failed.', details: status.error?.details };
  if (status.state !== 'ready') return { state: 'installable', message: 'Host browser automation pack is not installed yet.' };

  const adapter = options.adapter ?? createBrowserRuntimeAdapter(options);
  const executable = await firstExistingCandidate(adapter.chromiumExecutableCandidates);
  if (!executable) {
    return {
      state: 'failed',
      message: 'Browser pack is installed but no Chromium executable was found.',
      details: { remediationAction: 'browserPack.reinstall', containerFallback: true },
    };
  }

  try {
    await (options.launch ?? launchChromium)(executable, adapter.env);
    return { state: 'ready', message: 'Host browser automation pack is installed and launchable.' };
  } catch (error) {
    return launchFailure(error, options.platform ?? process.platform);
  }
}

async function launchChromium(executable: string, env: Record<string, string>): Promise<void> {
  await execFileAsync(executable, ['--version'], {
    env: { ...process.env, ...env },
    timeout: 10_000,
    windowsHide: true,
  });
}

function launchFailure(error: unknown, platform: NodeJS.Platform): BrowserDoctorResult {
  const message = error instanceof Error ? error.message : 'Chromium launch failed.';
  if (platform === 'linux' && isLinuxSharedLibraryFailure(message)) {
    return {
      state: 'failed',
      message: 'Chromium could not launch because required Linux shared libraries are missing. Install the Playwright system dependencies for your distribution or switch this workspace to a container runtime.',
      details: {
        reason: 'linux-shared-libraries-missing',
        remediationAction: 'browserPack.showLinuxDependencies',
        containerFallback: true,
        originalError: message,
      },
    };
  }
  return {
    state: 'failed',
    message: `Chromium launch check failed: ${message}`,
    details: { remediationAction: 'browserPack.reinstall', containerFallback: true, originalError: message },
  };
}

function isLinuxSharedLibraryFailure(message: string): boolean {
  return /error while loading shared libraries|cannot open shared object file|libnss3|libatk|libx11|libgbm|libasound/i.test(message);
}
