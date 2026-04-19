import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import type { PluginDevSessionUiMode } from '@sero-ai/common';
import { hasBuiltPluginDevUi } from './manifest';

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_POLL_TIMEOUT_MS = 20_000;
const HEALTH_REQUEST_TIMEOUT_MS = 2_000;
const OUTPUT_LIMIT = 4_000;

interface ManagedPluginDevServer {
  sourcePath: string;
  command: string;
  declaredDevPort: number;
  child: ChildProcess;
  output: string;
}

export interface EnsurePluginDevServerOptions {
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
}

const managedServers = new Map<string, ManagedPluginDevServer>();

function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function buildRemoteEntryOverride(port: number): string {
  return `http://127.0.0.1:${port}/mf-manifest.json`;
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

function getManagedServer(sourcePath: string): ManagedPluginDevServer | undefined {
  const entry = managedServers.get(normalizeSourcePath(sourcePath));
  if (!entry) return undefined;
  if (entry.child.exitCode !== null || entry.child.killed) {
    managedServers.delete(entry.sourcePath);
    return undefined;
  }
  return entry;
}

function startManagedServer(
  sourcePath: string,
  command: string,
  declaredDevPort: number,
): ManagedPluginDevServer {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const child = spawn('sh', ['-c', command], {
    cwd: normalizedSourcePath,
    env: process.env,
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
  return {
    remoteEntryOverride: null,
    uiMode: builtUiAvailable ? 'built-fallback' : 'unavailable',
    error,
  };
}

function createUnownedServerError(sourcePath: string, declaredDevPort: number): string {
  return `Refusing to reuse a pre-existing local plugin UI dev server on port ${declaredDevPort} for ${sourcePath} because Sero cannot verify that it belongs to this session.`;
}

async function probeRemoteEntry(remoteEntryOverride: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(remoteEntryOverride, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForRemoteEntry(
  remoteEntryOverride: string,
  entry?: ManagedPluginDevServer,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < HEALTH_POLL_TIMEOUT_MS) {
    if (await probeRemoteEntry(remoteEntryOverride)) {
      return true;
    }

    if (entry && (entry.child.exitCode !== null || entry.child.killed)) {
      return false;
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return false;
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

  const remoteEntryOverride = buildRemoteEntryOverride(options.declaredDevPort);
  let entry = getManagedServer(sourcePath);

  if (entry && !hasMatchingManagedServer(entry, options.command, options.declaredDevPort)) {
    await stopPluginDevServer(sourcePath);
    entry = undefined;
  }

  if (entry && await probeRemoteEntry(remoteEntryOverride)) {
    return {
      remoteEntryOverride,
      uiMode: 'dev-server',
      error: null,
    };
  }

  if (!entry && await probeRemoteEntry(remoteEntryOverride)) {
    return createFallbackResult(
      builtUiAvailable,
      createUnownedServerError(sourcePath, options.declaredDevPort),
    );
  }

  if (!entry) {
    try {
      entry = startManagedServer(sourcePath, options.command, options.declaredDevPort);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return createFallbackResult(
        builtUiAvailable,
        `Dev server start failed for "${options.command}": ${message}`,
      );
    }
  }

  if (await waitForRemoteEntry(remoteEntryOverride, entry)) {
    return {
      remoteEntryOverride,
      uiMode: 'dev-server',
      error: null,
    };
  }

  await stopPluginDevServer(sourcePath);
  return createFallbackResult(builtUiAvailable, summarizeStartupFailure(options.command, entry));
}

export async function stopAllPluginDevServers(): Promise<void> {
  await Promise.allSettled(
    [...managedServers.keys()].map((sourcePath) => stopPluginDevServer(sourcePath)),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
