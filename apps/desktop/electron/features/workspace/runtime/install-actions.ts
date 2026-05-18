import { createBrowserPackInstaller } from './browser-pack/installer';
import type { BrowserPackProgressEvent, BrowserPackStatus } from './browser-pack/types';
import { ToolchainManager } from './toolchains/manager';
import { loadBundledToolchainManifest } from './toolchains/manifest';
import type { ToolInstallReason, ToolStatus, ToolchainProgressEvent } from './toolchains/types';
import type {
  BrowserPackProgressIPC,
  BrowserPackStatusIPC,
  ManagedToolStatusIPC,
  RuntimeInstallErrorIPC,
  ToolchainProgressIPC,
  ToolchainStatusIPC,
} from '@sero-ai/common';

const CORE_TOOLS = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'] as const;

type CoreToolName = (typeof CORE_TOOLS)[number];

type ToolchainManagerLike = Pick<ToolchainManager, 'status' | 'ensureCore' | 'subscribe'>;
type BrowserPackInstallerLike = {
  status(): Promise<BrowserPackStatus>;
  ensure(reason: { kind: 'settings'; detail?: string }): Promise<BrowserPackStatus>;
  uninstall(): Promise<BrowserPackStatus>;
  subscribe(listener: (event: BrowserPackProgressEvent) => void): () => void;
};

let toolchainManager: ToolchainManagerLike | null = null;
let browserPackInstaller: BrowserPackInstallerLike | null = null;
let toolchainEnsureInFlight: Promise<ToolchainStatusIPC> | null = null;
let lastToolchainProgress: ToolchainProgressIPC | undefined;
let lastBrowserPackProgress: BrowserPackProgressIPC | undefined;
let lastToolchainFailure: RuntimeInstallErrorIPC | undefined;
const toolchainProgressListeners = new Set<(event: ToolchainProgressIPC) => void>();
const browserProgressListeners = new Set<(event: BrowserPackProgressIPC) => void>();

export function getToolchainStatus(): Promise<ToolchainStatusIPC> {
  return buildToolchainStatus();
}

export function ensureCoreTools(reason = 'settings'): Promise<ToolchainStatusIPC> {
  if (toolchainEnsureInFlight) return toolchainEnsureInFlight;
  toolchainEnsureInFlight = ensureCoreToolsInternal(reason).finally(() => {
    toolchainEnsureInFlight = null;
  });
  return toolchainEnsureInFlight;
}

export async function getBrowserPackStatus(): Promise<BrowserPackStatusIPC> {
  return toBrowserPackStatusIPC(await getBrowserInstaller().status());
}

export async function ensureBrowserPack(reason = 'settings'): Promise<BrowserPackStatusIPC> {
  try {
    return toBrowserPackStatusIPC(await getBrowserInstaller().ensure({ kind: 'settings', detail: reason }));
  } catch {
    return getBrowserPackStatus();
  }
}

export async function uninstallBrowserPack(): Promise<BrowserPackStatusIPC> {
  return toBrowserPackStatusIPC(await getBrowserInstaller().uninstall());
}

export function onToolchainProgress(listener: (event: ToolchainProgressIPC) => void): () => void {
  toolchainProgressListeners.add(listener);
  return () => toolchainProgressListeners.delete(listener);
}

export function onBrowserPackProgress(listener: (event: BrowserPackProgressIPC) => void): () => void {
  browserProgressListeners.add(listener);
  return () => browserProgressListeners.delete(listener);
}

export function setRuntimeInstallManagersForTest(input: {
  toolchain?: ToolchainManagerLike | null;
  browserPack?: BrowserPackInstallerLike | null;
}): void {
  toolchainManager = input.toolchain ?? null;
  browserPackInstaller = input.browserPack ?? null;
  toolchainManager?.subscribe((event) => emitToolchainProgress(event));
  browserPackInstaller?.subscribe((event) => emitBrowserProgress(event));
  toolchainEnsureInFlight = null;
  lastToolchainProgress = undefined;
  lastBrowserPackProgress = undefined;
  lastToolchainFailure = undefined;
}

async function ensureCoreToolsInternal(reason: string): Promise<ToolchainStatusIPC> {
  try {
    await getToolchainManager().ensureCore({ kind: 'settings', detail: reason });
    return buildToolchainStatus(false);
  } catch {
    return buildToolchainStatus(false);
  }
}

async function buildToolchainStatus(useInFlight = true): Promise<ToolchainStatusIPC> {
  if (useInFlight && toolchainEnsureInFlight) {
    return { state: 'installing', tools: [], progress: lastToolchainProgress };
  }

  const tools = await Promise.all(CORE_TOOLS.map((tool) => getToolchainManager().status(tool)));
  const ipcTools = tools.map(toManagedToolStatusIPC);
  const failed = ipcTools.find((tool) => tool.state === 'failed');
  if (failed?.error) return { state: 'failed', tools: ipcTools, progress: lastToolchainProgress, error: failed.error };
  if (lastToolchainFailure) {
    return { state: 'failed', tools: ipcTools, progress: lastToolchainProgress, error: lastToolchainFailure };
  }
  if (ipcTools.every((tool) => tool.state === 'ready')) {
    return { state: 'ready', tools: ipcTools, progress: lastToolchainProgress };
  }
  return { state: 'missing', tools: ipcTools, progress: lastToolchainProgress, error: ipcTools.find((tool) => tool.error)?.error };
}

function getToolchainManager(): ToolchainManagerLike {
  if (!toolchainManager) {
    const manager = new ToolchainManager({ manifest: loadBundledToolchainManifest() });
    manager.subscribe((event) => emitToolchainProgress(event));
    toolchainManager = manager;
  }
  return toolchainManager;
}

function getBrowserInstaller(): BrowserPackInstallerLike {
  if (!browserPackInstaller) {
    const installer = createBrowserPackInstaller();
    installer.subscribe((event) => emitBrowserProgress(event));
    browserPackInstaller = installer;
  }
  return browserPackInstaller;
}

function emitToolchainProgress(event: ToolchainProgressEvent): void {
  const payload = toToolchainProgressIPC(event);
  lastToolchainProgress = payload;
  if (payload.phase === 'failed') lastToolchainFailure = payload.error;
  if (payload.phase === 'queued' || payload.phase === 'ready') lastToolchainFailure = undefined;
  for (const listener of toolchainProgressListeners) listener(payload);
}

function emitBrowserProgress(event: BrowserPackProgressEvent): void {
  const payload = toBrowserPackProgressIPC(event);
  lastBrowserPackProgress = payload;
  for (const listener of browserProgressListeners) listener(payload);
}

function toManagedToolStatusIPC(status: ToolStatus): ManagedToolStatusIPC {
  return {
    tool: status.tool,
    state: status.state,
    source: status.source,
    path: status.path,
    version: status.version,
    error: 'error' in status && status.error ? toRuntimeInstallErrorIPC(status.error) : undefined,
  };
}

function toBrowserPackStatusIPC(status: BrowserPackStatus): BrowserPackStatusIPC {
  return {
    state: status.state,
    manifestVersion: status.manifestVersion,
    artifactKey: status.artifactKey,
    browsersPath: status.browsersPath,
    progress: lastBrowserPackProgress,
    error: status.error ? toRuntimeInstallErrorIPC(status.error) : undefined,
  };
}

function toToolchainProgressIPC(event: ToolchainProgressEvent): ToolchainProgressIPC {
  return {
    tool: event.tool,
    phase: event.phase,
    artifactKey: event.artifactKey,
    manifestVersion: event.manifestVersion,
    bytesReceived: event.bytesReceived,
    bytesTotal: event.bytesTotal,
    error: event.error ? toRuntimeInstallErrorIPC(event.error) : undefined,
  };
}

function toBrowserPackProgressIPC(event: BrowserPackProgressEvent): BrowserPackProgressIPC {
  return {
    phase: event.phase,
    manifestVersion: event.manifestVersion,
    artifactKey: event.artifactKey,
    bytesReceived: event.bytesReceived,
    bytesTotal: event.bytesTotal,
    error: event.error ? toRuntimeInstallErrorIPC(event.error) : undefined,
  };
}

function toRuntimeInstallErrorIPC(error: {
  code: string;
  message: string;
  retryable: boolean;
  installable?: boolean;
  details?: Record<string, string | number | boolean | null>;
}): RuntimeInstallErrorIPC {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    installable: error.installable,
    details: error.details,
  };
}
