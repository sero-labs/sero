import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import type { PluginDevSessionUiMode } from '@sero-ai/common';
import { hasBuiltPluginDevUi } from './manifest';
import {
  isNativeOptionalDependencyFailure,
  repairPluginNativeDeps,
} from './native-deps-repair';
import {
  classifyNativeBuildFailure,
  createNativeBuildToolsRequiredMetadata,
} from '@electron/features/workspace/runtime/native-build/classifier';
import type { NativeBuildToolsRequiredMetadata } from '@electron/features/workspace/runtime/native-build/types';
import { stopStalePortListenersForSourcePath } from './process-helpers';
import { renderPluginHostShellCommand } from '../host-command-runner';

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_POLL_TIMEOUT_MS = 20_000;
const HEALTH_REQUEST_TIMEOUT_MS = 2_000;
const OUTPUT_LIMIT = 4_000;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const;

interface ManagedPluginDevServer {
  sourcePath: string;
  command: string;
  declaredDevPort: number;
  child: ChildProcess;
  output: string;
}

interface RemoteEntryProbeResult {
  status: 'unreachable' | 'ready' | 'mismatch';
  remoteName: string | null;
}

export interface EnsurePluginDevServerOptions {
  appId: string;
  sourcePath: string;
  declaredDevPort: number | undefined;
  command: string | null;
  hasDeclaredUi: boolean;
  hasBuiltUi?: boolean;
}

export interface PluginDevServerResult {
  remoteEntryOverride: string | null;
  uiMode: PluginDevSessionUiMode;
  error?: string | null;
  nativeBuildToolsRequired?: NativeBuildToolsRequiredMetadata;
}

const managedServers = new Map<string, ManagedPluginDevServer>();

function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

function buildRemoteEntryOverride(host: (typeof LOOPBACK_HOSTS)[number], port: number): string {
  return `http://${host}:${port}/mf-manifest.json`;
}

function getRemoteEntryOverrideCandidates(port: number): string[] {
  return LOOPBACK_HOSTS.map((host) => buildRemoteEntryOverride(host, port));
}

function trimOutput(output: string): string {
  return output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-OUTPUT_LIMIT);
}

function appendOutput(entry: ManagedPluginDevServer, chunk: unknown): void {
  const nextChunk = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
  entry.output = `${entry.output}\n${nextChunk}`.slice(-OUTPUT_LIMIT * 2);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readRemoteManifestName(value: unknown): string | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (typeof value.id === 'string' && value.id.trim()) {
    return value.id.trim();
  }

  if (typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim();
  }

  const metaData = value.metaData;
  if (!isObjectRecord(metaData)) {
    return null;
  }

  return typeof metaData.name === 'string' && metaData.name.trim()
    ? metaData.name.trim()
    : null;
}

function getManagedServer(sourcePath: string): ManagedPluginDevServer | undefined {
  const entry = managedServers.get(normalizeSourcePath(sourcePath));
  if (!entry) return undefined;
  if (entry.child.exitCode !== null || entry.child.killed) {
    managedServers.delete(entry.sourcePath);
    return undefined;
  }
  return entry;
}

async function startManagedServer(
  sourcePath: string,
  command: string,
  declaredDevPort: number,
): Promise<ManagedPluginDevServer> {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const renderedCommand = await renderPluginHostShellCommand(command, normalizedSourcePath);
  const child = spawn(renderedCommand.program, renderedCommand.args, {
    cwd: renderedCommand.cwd,
    env: renderedCommand.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const entry: ManagedPluginDevServer = {
    sourcePath: normalizedSourcePath,
    command,
    declaredDevPort,
    child,
    output: '',
  };

  child.stdout?.on('data', (chunk) => appendOutput(entry, chunk));
  child.stderr?.on('data', (chunk) => appendOutput(entry, chunk));
  child.on('exit', () => {
    const current = managedServers.get(normalizedSourcePath);
    if (current?.child.pid === child.pid) {
      managedServers.delete(normalizedSourcePath);
    }
  });
  child.on('error', (error) => appendOutput(entry, error.message));
  child.unref();

  managedServers.set(normalizedSourcePath, entry);
  return entry;
}

function createFallbackResult(
  builtUiAvailable: boolean,
  error: string,
): PluginDevServerResult {
  const failure = classifyNativeBuildFailure({
    command: 'plugin dev server',
    exitCode: 1,
    stdout: '',
    stderr: error,
    platform: process.platform,
  });
  return {
    remoteEntryOverride: null,
    uiMode: builtUiAvailable ? 'built-fallback' : 'unavailable',
    error,
    nativeBuildToolsRequired: failure ? createNativeBuildToolsRequiredMetadata(failure) : undefined,
  };
}

function createUnexpectedRemoteError(
  sourcePath: string,
  declaredDevPort: number,
  expectedRemoteName: string,
  actualRemoteName: string | null,
): string {
  const actualLabel = actualRemoteName ? `"${actualRemoteName}"` : 'an unknown remote';
  return `Refusing to use the local plugin UI dev server on port ${declaredDevPort} for ${sourcePath} because it serves ${actualLabel} instead of "${expectedRemoteName}".`;
}

function createUnmanagedRemoteReuseError(
  sourcePath: string,
  declaredDevPort: number,
  expectedRemoteName: string,
): string {
  return `Refusing to reuse an unmanaged local plugin UI dev server on port ${declaredDevPort} for ${sourcePath}, even though it serves "${expectedRemoteName}". Stop the existing server and let Sero relaunch it for this checkout.`;
}

async function probeRemoteEntry(
  remoteEntryOverride: string,
  expectedRemoteName?: string,
): Promise<RemoteEntryProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(remoteEntryOverride, { signal: controller.signal });
    if (!response.ok) {
      return { status: 'unreachable', remoteName: null };
    }

    const remoteName = readRemoteManifestName(await response.json());
    if (expectedRemoteName && remoteName !== expectedRemoteName) {
      return { status: 'mismatch', remoteName };
    }

    return { status: 'ready', remoteName };
  } catch {
    return { status: 'unreachable', remoteName: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeRemoteEntryCandidates(
  remoteEntryOverrides: string[],
  expectedRemoteName?: string,
): Promise<{ remoteEntryOverride: string; probe: RemoteEntryProbeResult } | null> {
  let mismatch: { remoteEntryOverride: string; probe: RemoteEntryProbeResult } | null = null;

  for (const remoteEntryOverride of remoteEntryOverrides) {
    const probe = await probeRemoteEntry(remoteEntryOverride, expectedRemoteName);
    if (probe.status === 'ready') {
      return { remoteEntryOverride, probe };
    }
    if (probe.status === 'mismatch' && !mismatch) {
      mismatch = { remoteEntryOverride, probe };
    }
  }

  return mismatch;
}

async function waitForRemoteEntry(
  remoteEntryOverrides: string[],
  entry?: ManagedPluginDevServer,
  expectedRemoteName?: string,
): Promise<{ remoteEntryOverride: string; probe: RemoteEntryProbeResult } | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < HEALTH_POLL_TIMEOUT_MS) {
    const resolvedProbe = await probeRemoteEntryCandidates(remoteEntryOverrides, expectedRemoteName);

    if (entry && (entry.child.exitCode !== null || entry.child.killed)) {
      return resolvedProbe?.probe.status === 'mismatch' ? resolvedProbe : null;
    }

    if (resolvedProbe) {
      return resolvedProbe;
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return null;
}

function summarizeStartupFailure(command: string, entry?: ManagedPluginDevServer): string {
  const output = trimOutput(entry?.output ?? '');
  if (!output) {
    return `Dev server start failed for "${command}".`;
  }
  return `Dev server start failed for "${command}": ${output}`;
}

function hasMatchingManagedServer(
  entry: ManagedPluginDevServer | undefined,
  command: string,
  declaredDevPort: number,
): entry is ManagedPluginDevServer {
  return !!entry
    && entry.command === command
    && entry.declaredDevPort === declaredDevPort;
}

export async function stopPluginDevServer(sourcePath: string): Promise<void> {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const entry = managedServers.get(normalizedSourcePath);
  if (!entry?.child.pid) {
    managedServers.delete(normalizedSourcePath);
    return;
  }

  managedServers.delete(normalizedSourcePath);

  try {
    process.kill(-entry.child.pid, 'SIGTERM');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== 'ESRCH') {
      throw error;
    }
  }
}

export async function ensurePluginDevServer(
  options: EnsurePluginDevServerOptions,
): Promise<PluginDevServerResult> {
  const sourcePath = normalizeSourcePath(options.sourcePath);
  const builtUiAvailable = options.hasBuiltUi ?? await hasBuiltPluginDevUi(sourcePath);

  if (!options.hasDeclaredUi) {
    return {
      remoteEntryOverride: null,
      uiMode: 'backend-only',
      error: null,
    };
  }

  if (!options.declaredDevPort) {
    return createFallbackResult(
      builtUiAvailable,
      `Local plugin UI dev server requires sero.app.devPort in package.json: ${sourcePath}`,
    );
  }

  if (!options.command) {
    return createFallbackResult(
      builtUiAvailable,
      `Local plugin UI dev server requires a scripts.dev command in package.json: ${sourcePath}`,
    );
  }

  const expectedRemoteName = toRemoteName(options.appId);
  const remoteEntryOverrides = getRemoteEntryOverrideCandidates(options.declaredDevPort);
  let entry = getManagedServer(sourcePath);

  if (entry && !hasMatchingManagedServer(entry, options.command, options.declaredDevPort)) {
    await stopPluginDevServer(sourcePath);
    entry = undefined;
  }

  if (entry) {
    const resolvedProbe = await probeRemoteEntryCandidates(remoteEntryOverrides, expectedRemoteName);
    if (resolvedProbe?.probe.status === 'ready') {
      return {
        remoteEntryOverride: resolvedProbe.remoteEntryOverride,
        uiMode: 'dev-server',
        error: null,
      };
    }

    if (resolvedProbe?.probe.status === 'mismatch') {
      await stopPluginDevServer(sourcePath);
      return createFallbackResult(
        builtUiAvailable,
        createUnexpectedRemoteError(
          sourcePath,
          options.declaredDevPort,
          expectedRemoteName,
          resolvedProbe.probe.remoteName,
        ),
      );
    }
  }

  if (!entry) {
    const resolvedProbe = await probeRemoteEntryCandidates(remoteEntryOverrides, expectedRemoteName);
    if (resolvedProbe?.probe.status === 'ready') {
      const stoppedStaleListeners = await stopStalePortListenersForSourcePath(
        options.declaredDevPort,
        sourcePath,
      );
      if (!stoppedStaleListeners) {
        return createFallbackResult(
          builtUiAvailable,
          createUnmanagedRemoteReuseError(
            sourcePath,
            options.declaredDevPort,
            expectedRemoteName,
          ),
        );
      }
    }

    if (resolvedProbe?.probe.status === 'mismatch') {
      return createFallbackResult(
        builtUiAvailable,
        createUnexpectedRemoteError(
          sourcePath,
          options.declaredDevPort,
          expectedRemoteName,
          resolvedProbe.probe.remoteName,
        ),
      );
    }
  }

  if (!entry) {
    try {
      entry = await startManagedServer(sourcePath, options.command, options.declaredDevPort);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return createFallbackResult(
        builtUiAvailable,
        `Dev server start failed for "${options.command}": ${message}`,
      );
    }
  }

  const resolvedProbe = await waitForRemoteEntry(remoteEntryOverrides, entry, expectedRemoteName);
  if (resolvedProbe?.probe.status === 'ready') {
    return {
      remoteEntryOverride: resolvedProbe.remoteEntryOverride,
      uiMode: 'dev-server',
      error: null,
    };
  }

  await stopPluginDevServer(sourcePath);
  if (resolvedProbe?.probe.status === 'mismatch') {
    return createFallbackResult(
      builtUiAvailable,
      createUnexpectedRemoteError(
        sourcePath,
        options.declaredDevPort,
        expectedRemoteName,
        resolvedProbe.probe.remoteName,
      ),
    );
  }

  let startupFailure = summarizeStartupFailure(options.command, entry);
  if (isNativeOptionalDependencyFailure(startupFailure)) {
    const repair = await repairPluginNativeDeps(sourcePath);
    if (repair.ok) {
      try {
        entry = await startManagedServer(sourcePath, options.command, options.declaredDevPort);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        return createFallbackResult(
          builtUiAvailable,
          `Dev server start failed after repairing native dependencies for "${options.command}": ${message}`,
        );
      }

      const retryProbe = await waitForRemoteEntry(remoteEntryOverrides, entry, expectedRemoteName);
      if (retryProbe?.probe.status === 'ready') {
        return {
          remoteEntryOverride: retryProbe.remoteEntryOverride,
          uiMode: 'dev-server',
          error: null,
        };
      }

      await stopPluginDevServer(sourcePath);
      if (retryProbe?.probe.status === 'mismatch') {
        return createFallbackResult(
          builtUiAvailable,
          createUnexpectedRemoteError(
            sourcePath,
            options.declaredDevPort,
            expectedRemoteName,
            retryProbe.probe.remoteName,
          ),
        );
      }

      startupFailure = summarizeStartupFailure(options.command, entry);
    } else {
      startupFailure = `${startupFailure} Sero tried to repair native dependencies with "pnpm install --force", but it failed: ${repair.output}`;
      if (repair.nativeBuildToolsRequired) {
        const result = createFallbackResult(builtUiAvailable, startupFailure);
        return { ...result, nativeBuildToolsRequired: repair.nativeBuildToolsRequired };
      }
    }
  }

  return createFallbackResult(builtUiAvailable, startupFailure);
}

export async function stopAllPluginDevServers(): Promise<void> {
  await Promise.allSettled(
    [...managedServers.keys()].map((sourcePath) => stopPluginDevServer(sourcePath)),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
