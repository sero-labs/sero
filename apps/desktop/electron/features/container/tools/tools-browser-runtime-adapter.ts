import generatedArtifacts from '@electron/features/workspace/runtime/browser-pack/generated-artifacts.json';
import { createBrowserRuntimeAdapter, firstExistingCandidate } from '@electron/features/workspace/runtime/browser-pack/adapter';
import { browserPackStatus, ensureBrowserPackForAgent } from '@electron/features/workspace/runtime/install-actions';
import type { BrowserPackError, BrowserPackStatus, BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import type { RuntimeBackend, RuntimeBackendId } from '@electron/features/workspace/runtime/types';
import { shellEscape } from './tool-schemas';

export interface BrowserAutomationRuntime {
  adapter: BrowserRuntimeAdapter;
  executablePath: string | null;
}

export type BrowserAutomationRuntimeResolver = (runtime: RuntimeBackend, workspaceId: string) => Promise<BrowserAutomationRuntime>;

export class BrowserPackRequiredError extends Error {
  readonly code = 'BROWSER_PACK_REQUIRED';
  readonly installable: boolean;
  readonly retryable: boolean;
  readonly status: BrowserPackStatus;
  readonly details: BrowserPackError | undefined;

  constructor(status: BrowserPackStatus) {
    super(status.error?.message ?? 'Host browser automation pack is required.');
    this.name = 'BrowserPackRequiredError';
    this.installable = status.error?.installable ?? status.state === 'installable';
    this.retryable = status.error?.retryable ?? status.state !== 'installing';
    this.status = status;
    this.details = status.error;
  }
}

export async function resolveBrowserAutomationRuntime(runtime: RuntimeBackend, workspaceId: string): Promise<BrowserAutomationRuntime> {
  if (runtime.backend === 'host') return resolveHostBrowserAutomationRuntime(workspaceId);
  const adapter = createContainerBrowserRuntimeAdapter(runtime.backend);
  return { adapter, executablePath: await resolveRuntimeBrowserExecutable(runtime, adapter) };
}

export async function ensureAgentBrowserAvailable(runtime: RuntimeBackend, adapter?: BrowserRuntimeAdapter): Promise<void> {
  // The command is launched with the pack's own bin folder first on PATH, so
  // those files count even where `command -v` does not resolve a `.cmd` shim.
  const shellPlatform = hostShellPlatform(runtime);
  const candidateChecks = (adapter?.agentBrowserCandidates ?? [])
    .map((candidate) => `[ -f ${shellPath(candidate, shellPlatform)} ]`)
    .join(' || ');
  const command = candidateChecks
    ? `command -v agent-browser >/dev/null 2>&1 || ${candidateChecks}`
    : 'command -v agent-browser >/dev/null 2>&1';
  const hasBinary = await runtime.exec({ command: withPathPrefix(command, adapter, shellPlatform), timeoutMs: 5_000 });
  if (hasBinary.exitCode !== 0) {
    throw new Error('agent-browser CLI is not available in this runtime. Use a Sero runtime image with browser automation support.');
  }
}

export async function ensureFfmpegAvailable(runtime: RuntimeBackend): Promise<void> {
  // WebM recording wants the `libvpx` (VP8) encoder. Playwright's ffmpeg build
  // carries only `libvpx-vp9`, and handing it to `record` kills the take with
  // `ffmpeg write failed: Broken pipe`, so the encoder is checked up front.
  const probe = await runtime.exec({
    command: "command -v ffmpeg >/dev/null 2>&1 || exit 2; "
      + "ffmpeg -hide_banner -encoders 2>/dev/null | awk '$2==\"libvpx\"{f=1} END{exit !f}' || exit 3",
    timeoutMs: 10_000,
  });
  if (probe.exitCode === 0) return;
  if (probe.exitCode === 3) {
    throw new Error(
      'ffmpeg here cannot encode VP8, which automation browser recordings need. '
      + 'Install a full ffmpeg build (the Playwright one has VP9 only), or use a container runtime whose image ships one.',
    );
  }
  throw new Error('ffmpeg is not available for automation browser recording. Install ffmpeg, or use a container runtime whose image ships it.');
}

export function agentBrowserCommand(
  adapter: BrowserRuntimeAdapter,
  args: string[],
  env?: Record<string, string | number | boolean | undefined>,
  shellPlatform?: NodeJS.Platform,
): string {
  const exports = Object.entries({ ...adapter.env, ...env })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `export ${key}='${shellEscape(String(value))}';`);
  const pathPrefixes = adapterPathPrefixes(adapter).map((entry) => toHostShellPath(entry, shellPlatform));
  if (pathPrefixes.length > 0) exports.push(`export PATH='${shellEscape(pathPrefixes.join(':'))}':"$PATH";`);
  const commandArgs = args.map((arg) => `'${shellEscape(arg)}'`).join(' ');
  return `${exports.join(' ')} agent-browser ${commandArgs}`;
}

/** The browser writes the file itself, so a host workspace needs its real path, not `/workspace`. */
function browserWorkspacePath(runtime: RuntimeBackend): string {
  return runtime.backend === 'host' ? runtime.hostWorkspacePath : runtime.runtimeWorkspacePath;
}

export function defaultRecordingPath(runtime: RuntimeBackend): string {
  return joinRuntimePath(browserWorkspacePath(runtime), 'agent-browser-recording.webm');
}

/**
 * A host workspace may only touch files inside its own roots, and the browser
 * pack's temp folder is not one, so the image goes under the workspace's own
 * `.sero` folder there.
 */
export function screenshotPath(runtime: RuntimeBackend, adapter: BrowserRuntimeAdapter): string {
  return runtime.backend === 'host'
    ? joinRuntimePath(runtime.hostWorkspacePath, '.sero/tmp/automation-browser-shot.png')
    : defaultScreenshotPath(adapter);
}

export function defaultScreenshotPath(adapter: BrowserRuntimeAdapter): string {
  return joinRuntimePath(adapter.tempDir, 'sero-agent-browser-shot.png');
}

async function resolveHostBrowserAutomationRuntime(workspaceId: string): Promise<BrowserAutomationRuntime> {
  // The first call installs the pack, or waits for the download a session start began.
  let status = await browserPackStatus();
  if (status.state !== 'ready') status = await ensureBrowserPackForAgent(workspaceId).catch(() => browserPackStatus());
  if (status.state !== 'ready') throw new BrowserPackRequiredError(status);

  const adapter = createBrowserRuntimeAdapter();
  const executablePath = await firstExistingCandidate(adapter.chromiumExecutableCandidates);
  if (!executablePath) {
    throw new BrowserPackRequiredError({
      ...status,
      state: 'failed',
      error: {
        code: 'BROWSER_PACK_REQUIRED',
        message: 'Host browser automation pack is installed, but Chromium is missing or not executable.',
        retryable: true,
        installable: true,
        manifestVersion: status.manifestVersion,
        artifactKey: status.artifactKey,
        details: { workspaceId },
      },
    });
  }
  return { adapter, executablePath };
}

function createContainerBrowserRuntimeAdapter(backend: RuntimeBackendId): BrowserRuntimeAdapter {
  const browsersPath = '/ms-playwright';
  const chromiumRevision = generatedArtifacts.pins.chromiumRevision;
  const chromiumCandidates = [
    `${browsersPath}/chromium-${chromiumRevision}/chrome-linux64/chrome`,
    `${browsersPath}/chromium-${chromiumRevision}/chrome-linux-arm64/chrome`,
    `${browsersPath}/chromium-${chromiumRevision}/chrome-linux/chrome`,
    `$HOME/.cache/ms-playwright/chromium-${chromiumRevision}/chrome-linux/chrome`,
    `/root/.cache/ms-playwright/chromium-${chromiumRevision}/chrome-linux/chrome`,
    `${browsersPath}/chromium-*/chrome-linux/chrome`,
    `${browsersPath}/chromium-*/chrome-linux64/chrome`,
    `${browsersPath}/chromium-*/chrome-linux-arm64/chrome`,
    '$HOME/.cache/ms-playwright/chromium-*/chrome-linux/chrome',
    '/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  return {
    browsersPath,
    chromiumExecutableCandidates: backend === 'apple-container'
      ? [`${browsersPath}/chromium-${chromiumRevision}/chrome-linux/chrome`, ...chromiumCandidates]
      : chromiumCandidates,
    // The image installs Ubuntu's ffmpeg, which has the libvpx encoder agent-browser records with.
    ffmpegCandidates: ['/usr/bin/ffmpeg'],
    agentBrowserCandidates: [],
    pathPrefixes: [],
    tempDir: '/tmp',
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
  };
}

async function resolveRuntimeBrowserExecutable(runtime: RuntimeBackend, adapter: BrowserRuntimeAdapter): Promise<string | null> {
  const shellPlatform = hostShellPlatform(runtime);
  const checks = adapter.chromiumExecutableCandidates.map((candidate) => candidateExecutableCheck(candidate, shellPlatform)).join(' ');
  const command = `${checks} command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || command -v google-chrome 2>/dev/null || command -v google-chrome-stable 2>/dev/null`;
  const result = await runtime.exec({ command, timeoutMs: 10_000 });
  const executablePath = result.stdout.trim();
  return result.exitCode === 0 && executablePath ? executablePath : null;
}

function candidateExecutableCheck(candidate: string, shellPlatform?: NodeJS.Platform): string {
  if (candidate.includes('*')) {
    return `for p in ${shellGlobPath(candidate, shellPlatform)}; do if [ -x "$p" ]; then printf "%s" "$p"; exit 0; fi; done;`;
  }
  const pathExpression = shellPath(candidate, shellPlatform);
  return `if [ -x ${pathExpression} ]; then printf '%s' '${shellEscape(candidate)}'; exit 0; fi;`;
}

function shellPath(candidate: string, shellPlatform?: NodeJS.Platform): string {
  if (candidate.startsWith('$HOME/')) return `"$HOME"/'${shellEscape(candidate.slice('$HOME/'.length))}'`;
  return `'${shellEscape(toHostShellPath(candidate, shellPlatform))}'`;
}

function shellGlobPath(candidate: string, shellPlatform?: NodeJS.Platform): string {
  if (candidate.startsWith('$HOME/')) return `"$HOME"/${candidate.slice('$HOME/'.length)}`;
  return toHostShellPath(candidate, shellPlatform);
}

function withPathPrefix(command: string, adapter: BrowserRuntimeAdapter | undefined, shellPlatform?: NodeJS.Platform): string {
  const pathPrefixes = adapter ? adapterPathPrefixes(adapter).map((entry) => toHostShellPath(entry, shellPlatform)) : [];
  return pathPrefixes.length > 0 ? `export PATH='${shellEscape(pathPrefixes.join(':'))}':"$PATH"; ${command}` : command;
}

function hostShellPlatform(runtime: RuntimeBackend): NodeJS.Platform | undefined {
  return runtime.backend === 'host' ? process.platform : undefined;
}

export function toHostShellPath(candidate: string, shellPlatform?: NodeJS.Platform): string {
  if (shellPlatform !== 'win32') return candidate;
  const normalized = candidate.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) return normalized;
  return `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

/**
 * Only the pack's own bin folder belongs on PATH. Recordings are encoded by
 * agent-browser itself since 0.41, and the pack ships Playwright's ffmpeg,
 * which is a VP9-only build: leaving it first on PATH handed `record` a
 * command it cannot run (`ffmpeg write failed: Broken pipe`).
 */
function adapterPathPrefixes(adapter: BrowserRuntimeAdapter): string[] {
  return uniquePaths(adapter.pathPrefixes);
}

function uniquePaths(paths: Array<string | null>): string[] {
  return Array.from(new Set(paths.filter((item): item is string => Boolean(item))));
}

function joinRuntimePath(root: string | undefined, filename: string): string {
  const base = root && root.length > 0 ? root : '.';
  return `${base.replace(/\/$/, '')}/${filename}`;
}
