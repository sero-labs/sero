import fs from 'fs';

import type {
  RtkToolchainLocation,
  RtkToolchainResolution,
} from '@sero-ai/common';
import type { RuntimeBackendId } from '@electron/features/workspace/runtime/types';
import { findArtifactForPlatform } from '@electron/features/workspace/runtime/toolchains/manifest';
import type {
  ToolInstallReason,
  ToolName,
  ToolResolution,
  ToolchainManifest,
} from '@electron/features/workspace/runtime/toolchains/types';
import { hostRtkStateDir, rtkStateEnv, runtimeRtkStateDir } from './state';

/** Image-owned RTK path inside a workspace container. */
export const RUNTIME_RTK_EXECUTABLE_PATH = '/usr/local/bin/rtk';

const PROBE_TIMEOUT_MS = 10_000;

export interface RtkToolchainTools {
  resolve(tool: ToolName): Promise<ToolResolution | null>;
  ensure(tool: ToolName, reason: ToolInstallReason): Promise<ToolResolution>;
}

export interface RtkToolchainServiceOptions {
  manifest: ToolchainManifest;
  tools: RtkToolchainTools;
  platform?: NodeJS.Platform;
  arch?: string;
  now?: () => number;
}

/**
 * The subset of the workspace runtime the RTK service needs. `RuntimeBackend`
 * satisfies it structurally, and a test can supply a small double.
 */
export interface RtkRuntimePort {
  backend: RuntimeBackendId;
  workspaceId: string;
  ensure(): Promise<{ containerId?: string }>;
  exec(input: { command: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface RtkResolveInput {
  sessionId: string;
  runtime: RtkRuntimePort;
}

interface RuntimeVersionProbe {
  state: 'ready' | 'unavailable';
  version?: string;
  reason?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function parseRtkVersion(output: string): string | undefined {
  return output.match(/(?:^|\s)rtk\s+(\d+\.\d+(?:\.\d+)?)/i)?.[1]
    ?? output.match(/^(\d+\.\d+(?:\.\d+)?)\s*$/m)?.[1];
}

/**
 * Resolve the verified RTK executable for one session's execution locations.
 *
 * The host copy is always the Sero-managed artifact. The runtime copy is the
 * image-owned absolute path, never a bare name, so `PATH` cannot shadow it.
 * A version difference disables rewriting instead of producing a command the
 * executing binary cannot run.
 */
export class RtkToolchainService {
  private readonly options: RtkToolchainServiceOptions;
  private readonly versionProbes = new Map<string, Promise<RuntimeVersionProbe>>();
  private readonly stateChecks = new Map<string, Promise<string | null>>();
  private install: Promise<void> | null = null;
  private installError: string | null = null;

  constructor(options: RtkToolchainServiceOptions) {
    this.options = options;
  }

  pinnedVersion(): string | undefined {
    const artifact = findArtifactForPlatform(
      this.options.manifest,
      'rtk',
      this.options.platform ?? process.platform,
      this.options.arch ?? process.arch,
    );
    return artifact?.version ?? artifact?.minVersion;
  }

  /** Drop cached runtime answers. A repair or container replacement calls this. */
  invalidate(): void {
    this.versionProbes.clear();
    this.stateChecks.clear();
  }

  async resolve(input: RtkResolveInput): Promise<RtkToolchainResolution> {
    const pin = this.pinnedVersion();
    if (!pin) {
      return { state: 'failed', reason: 'RTK is not available for this platform.' };
    }

    const host = await this.resolveHost(pin);
    if ('state' in host) return host;

    const runtimeLocation = await this.resolveRuntime(input, host, pin);
    if ('state' in runtimeLocation) return runtimeLocation;

    // Create the host state directory first so RTK's tracking and recovery files
    // land in a restricted directory rather than one created with the process
    // umask. This is best effort: if it fails, RTK creates the directory itself,
    // and a host state problem must not disable rewriting for the session.
    await prepareHostRtkStateDir(input.sessionId).catch(() => undefined);

    return {
      state: 'available',
      version: pin,
      host: { executablePath: host.path, env: rtkStateEnv(hostRtkStateDir(input.sessionId)) },
      runtime: runtimeLocation,
    };
  }

  private async resolveHost(pin: string): Promise<ToolResolution | { state: 'installing' | 'failed'; reason: string }> {
    const resolved = await this.options.tools.resolve('rtk');
    if (resolved && resolved.version === pin) return resolved;

    if (!this.install) void this.startInstall();
    if (this.installError) return { state: 'failed', reason: this.installError };
    return { state: 'installing', reason: `Installing the managed RTK ${pin} toolchain.` };
  }

  private startInstall(): void {
    const operation = this.options.tools
      .ensure('rtk', { kind: 'plugin-install', detail: 'rtk-toolchain' })
      .then(() => { this.installError = null; })
      .catch((error: unknown) => { this.installError = errorMessage(error); })
      .finally(() => { this.install = null; });
    this.install = operation;
  }

  private async resolveRuntime(
    input: RtkResolveInput,
    host: ToolResolution,
    pin: string,
  ): Promise<RtkToolchainLocation | { state: 'failed'; reason: string }> {
    const { runtime } = input;
    if (runtime.backend === 'host') {
      return { executablePath: host.path, env: rtkStateEnv(hostRtkStateDir(input.sessionId)) };
    }

    const identity = await this.runtimeIdentity(input);
    const probeKey = `${identity}:${pin}`;
    let probe = this.versionProbes.get(probeKey);
    if (!probe) {
      probe = this.probeRuntimeVersion(runtime);
      this.versionProbes.set(probeKey, probe);
    }
    const probed = await probe;

    if (probed.state === 'unavailable') {
      return { state: 'failed', reason: probed.reason ?? 'RTK is unavailable in the workspace runtime.' };
    }
    if (probed.version !== pin) {
      return {
        state: 'failed',
        reason: `RTK version mismatch: host ${pin}, container ${probed.version}. Rewriting is disabled for this session.`,
      };
    }

    const stateDir = runtimeRtkStateDir(input.sessionId);
    const stateFailure = await this.ensureRuntimeState(runtime, identity, pin, input.sessionId, stateDir);
    if (stateFailure) return { state: 'failed', reason: stateFailure };

    return { executablePath: RUNTIME_RTK_EXECUTABLE_PATH, env: rtkStateEnv(stateDir) };
  }

  private async runtimeIdentity(input: RtkResolveInput): Promise<string> {
    const session = await input.runtime.ensure();
    return session.containerId ?? `${input.runtime.backend}:${input.runtime.workspaceId}`;
  }

  private async probeRuntimeVersion(runtime: RtkRuntimePort): Promise<RuntimeVersionProbe> {
    const command = `${quoteShell(RUNTIME_RTK_EXECUTABLE_PATH)} --version`;
    const result = await runtime.exec({ command, timeoutMs: PROBE_TIMEOUT_MS }).catch((error: unknown) => ({
      stdout: '', stderr: errorMessage(error), exitCode: 1,
    }));
    if (result.exitCode !== 0) {
      return {
        state: 'unavailable',
        reason: `RTK is missing at ${RUNTIME_RTK_EXECUTABLE_PATH} in the workspace runtime: ${(result.stderr || result.stdout).trim() || `exit code ${result.exitCode}`}`,
      };
    }
    const version = parseRtkVersion(`${result.stdout}\n${result.stderr}`);
    if (!version) return { state: 'unavailable', reason: 'RTK in the workspace runtime did not report a version.' };
    return { state: 'ready', version };
  }

  private ensureRuntimeState(
    runtime: RtkRuntimePort,
    identity: string,
    pin: string,
    sessionId: string,
    stateDir: string,
  ): Promise<string | null> {
    const key = `${identity}:${pin}:${sessionId}`;
    const cached = this.stateChecks.get(key);
    if (cached) return cached;
    const check = runtime
      .exec({
        command: `mkdir -p ${quoteShell(stateDir)} && test -w ${quoteShell(stateDir)}`,
        timeoutMs: PROBE_TIMEOUT_MS,
      })
      .then((result) => (result.exitCode === 0
        ? null
        : `RTK state directory ${stateDir} is not writable in the workspace runtime.`))
      .catch((error: unknown) => `RTK state directory ${stateDir} is not writable in the workspace runtime: ${errorMessage(error)}`);
    this.stateChecks.set(key, check);
    return check;
  }
}

/** Prepare the host state directory so RTK writes stay inside it. */
export async function prepareHostRtkStateDir(sessionId: string): Promise<string> {
  const directory = hostRtkStateDir(sessionId);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
