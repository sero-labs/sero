import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const testEnv = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-rtk-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
    SERO_HOST_RTK_STATE_ROOT: `${root}/agent/rtk`,
  };
});

vi.mock('@electron/platform/env', () => testEnv);

import {
  RtkToolchainService,
  parseRtkVersion,
  type RtkRuntimePort,
  type RtkToolchainTools,
} from '@electron/features/rtk/service';
import { hostRtkStateDir, rtkSessionKey, runtimeRtkStateDir } from '@electron/features/rtk/state';
import type { ToolName, ToolResolution, ToolchainManifest } from '@electron/features/workspace/runtime/toolchains/types';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

function manifest(pin = '0.49.0'): ToolchainManifest {
  return {
    version: 'test',
    artifacts: {
      'rtk-linux-x64': {
        tool: 'rtk',
        platform: 'linux',
        arch: 'x64',
        url: 'https://downloads.example.test/rtk.tar.gz',
        sha256: 'a'.repeat(64),
        unpackTo: 'rtk-linux-x64',
        binPaths: { rtk: 'rtk-linux-x64/rtk' },
        minVersion: pin,
        version: pin,
        managedOnly: true,
        installPolicy: 'on-demand',
      },
    },
  };
}

function managedRtk(version = '0.49.0'): ToolResolution {
  return { tool: 'rtk', source: 'managed', path: '/managed/toolchains/rtk', version };
}

interface ToolsHarness extends RtkToolchainTools {
  resolveCalls: number;
  ensureCalls: number;
}

function toolsHarness(options: {
  resolved?: ToolResolution | null;
  afterInstall?: ToolResolution | null;
  ensureError?: Error;
} = {}): ToolsHarness {
  const state = {
    resolved: options.resolved === undefined ? managedRtk() : options.resolved,
    resolveCalls: 0,
    ensureCalls: 0,
  };
  return {
    get resolveCalls() { return state.resolveCalls; },
    get ensureCalls() { return state.ensureCalls; },
    async resolve(tool: ToolName) {
      state.resolveCalls += 1;
      expect(tool).toBe('rtk');
      return state.resolved;
    },
    async ensure(tool: ToolName) {
      state.ensureCalls += 1;
      expect(tool).toBe('rtk');
      if (options.ensureError) throw options.ensureError;
      state.resolved = options.afterInstall === undefined ? managedRtk() : options.afterInstall;
      if (!state.resolved) throw new Error('install produced nothing');
      return state.resolved;
    },
  } as ToolsHarness;
}

interface RuntimeHarness extends RtkRuntimePort {
  commands: string[];
  containerId: string;
  containerInstanceId?: string;
  version: string;
}

function runtimeHarness(options: {
  backend?: RtkRuntimePort['backend'];
  containerId?: string;
  version?: string;
  versionExitCode?: number;
  versionStderr?: string;
  stateExitCode?: number;
  /** Set false to model a runtime that exposes only the stable container name. */
  instanceIdentity?: boolean;
} = {}): RuntimeHarness {
  const commands: string[] = [];
  const harness: RuntimeHarness = {
    backend: options.backend ?? 'docker',
    workspaceId: 'ws-1',
    containerId: options.containerId ?? 'container-1',
    containerInstanceId: options.instanceIdentity === false ? undefined : 'instance-1',
    version: options.version ?? '0.49.0',
    commands,
    async ensure() {
      return {
        containerId: harness.containerId,
        ...(harness.containerInstanceId ? { containerInstanceId: harness.containerInstanceId } : {}),
      };
    },
    async exec(input) {
      commands.push(input.command);
      if (input.command.includes('--version')) {
        return {
          stdout: options.versionExitCode ? '' : `rtk ${harness.version}\n`,
          stderr: options.versionStderr ?? '',
          exitCode: options.versionExitCode ?? 0,
        };
      }
      return { stdout: '', stderr: '', exitCode: options.stateExitCode ?? 0 };
    },
  };
  return harness;
}

function serviceWith(tools: RtkToolchainTools, pin = '0.49.0'): RtkToolchainService {
  return new RtkToolchainService({ manifest: manifest(pin), tools, platform: 'linux', arch: 'x64' });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RtkToolchainService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testEnv.SERO_FIXED_ROOT, { recursive: true, force: true });
  });

  it('answers with verified host and runtime locations and separate state environments', async () => {
    const runtime = runtimeHarness();
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    expect(result).toMatchObject({
      state: 'available',
      version: '0.49.0',
      host: { executablePath: '/managed/toolchains/rtk' },
      runtime: { executablePath: '/usr/local/bin/rtk' },
    });
    expect(result.host?.env).toEqual({
      RTK_DB_PATH: `${hostRtkStateDir(SESSION_A)}/history.db`,
      RTK_RECALL_DB: `${hostRtkStateDir(SESSION_A)}/recall.db`,
      RTK_TEE_DIR: `${hostRtkStateDir(SESSION_A)}/tee`,
    });
    expect(result.runtime?.env).toEqual({
      RTK_DB_PATH: `${runtimeRtkStateDir(SESSION_A)}/history.db`,
      RTK_RECALL_DB: `${runtimeRtkStateDir(SESSION_A)}/recall.db`,
      RTK_TEE_DIR: `${runtimeRtkStateDir(SESSION_A)}/tee`,
    });
    expect(result.host?.env.RTK_DB_PATH.endsWith('history.db')).toBe(true);
    expect(result.runtime?.env.RTK_RECALL_DB.endsWith('recall.db')).toBe(true);
    expect(result.runtime?.env.RTK_TEE_DIR.endsWith('/tee')).toBe(true);
  });

  it('uses the host location for a host runtime', async () => {
    const runtime = runtimeHarness({ backend: 'host' });
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    expect(result.state).toBe('available');
    expect(result.runtime).toEqual(result.host);
    expect(runtime.commands).toEqual([]);
  });

  it('starts the first-use managed install and resolves it on a later request', async () => {
    const tools = toolsHarness({ resolved: null, afterInstall: managedRtk() });
    const service = serviceWith(tools);
    const runtime = runtimeHarness();

    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({ state: 'installing' });
    expect(tools.ensureCalls).toBe(1);
    await flush();

    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({
      state: 'available',
      version: '0.49.0',
    });
  });

  it('reports a failed install without failing the caller and retries on a later request', async () => {
    const tools = toolsHarness({ resolved: null, ensureError: new Error('network unreachable') });
    const service = serviceWith(tools);
    const runtime = runtimeHarness();

    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({ state: 'installing' });
    await flush();
    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({
      state: 'failed',
      reason: 'network unreachable',
    });
    expect(tools.ensureCalls).toBe(2);
  });

  it('reports unavailable for a platform with no RTK artifact', async () => {
    const service = new RtkToolchainService({
      manifest: manifest(),
      tools: toolsHarness(),
      platform: 'darwin',
      arch: 'x64',
    });

    await expect(service.resolve({ sessionId: SESSION_A, runtime: runtimeHarness() })).resolves.toEqual({
      state: 'failed',
      reason: 'RTK is not available for this platform.',
    });
  });

  it('probes the runtime executable once per container instance and pin', async () => {
    const runtime = runtimeHarness();
    const service = serviceWith(toolsHarness());

    await service.resolve({ sessionId: SESSION_A, runtime });
    await service.resolve({ sessionId: SESSION_B, runtime });
    expect(runtime.commands.filter((command) => command.includes('--version'))).toHaveLength(1);

    runtime.containerInstanceId = 'instance-2';
    await service.resolve({ sessionId: SESSION_A, runtime });
    expect(runtime.commands.filter((command) => command.includes('--version'))).toHaveLength(2);
  });

  it('re-probes a replaced container instead of keeping its old version', async () => {
    // The workspace container name is stable across a replacement, so an answer
    // cached by name kept reporting a mismatch after the image was updated.
    const runtime = runtimeHarness({ version: '0.48.0' });
    const service = serviceWith(toolsHarness());

    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({ state: 'failed' });

    runtime.version = '0.49.0';
    runtime.containerInstanceId = 'instance-2';
    await expect(service.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({ state: 'available' });
  });

  it('does not cache a runtime that reports no container instance identity', async () => {
    const runtime = runtimeHarness({ instanceIdentity: false });
    const service = serviceWith(toolsHarness());

    await service.resolve({ sessionId: SESSION_A, runtime });
    await service.resolve({ sessionId: SESSION_A, runtime });
    expect(runtime.commands.filter((command) => command.includes('--version'))).toHaveLength(2);
  });

  it('re-probes after the manifest pin changes', async () => {
    const runtime = runtimeHarness();
    const service = serviceWith(toolsHarness());

    await service.resolve({ sessionId: SESSION_A, runtime });
    expect(runtime.commands.filter((command) => command.includes('--version'))).toHaveLength(1);

    const repinned = serviceWith(toolsHarness({ resolved: managedRtk('0.50.0') }), '0.50.0');
    await expect(repinned.resolve({ sessionId: SESSION_A, runtime })).resolves.toMatchObject({ state: 'failed' });
    expect(runtime.commands.filter((command) => command.includes('--version'))).toHaveLength(2);
  });

  it('disables rewriting and reports both versions on a mismatch', async () => {
    const runtime = runtimeHarness({ version: '0.50.0' });
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    expect(result.state).toBe('failed');
    expect(result.reason).toContain('0.49.0');
    expect(result.reason).toContain('0.50.0');
  });

  it('reports unavailable when the runtime executable is missing', async () => {
    const runtime = runtimeHarness({ versionExitCode: 127, versionStderr: 'rtk: not found' });
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    expect(result).toMatchObject({ state: 'failed' });
    expect(result.reason).toContain('/usr/local/bin/rtk');
  });

  it('binds every probe and state command to an absolute executable path', async () => {
    const runtime = runtimeHarness();
    await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    for (const command of runtime.commands) {
      expect(command).not.toMatch(/(^|[^/\w])rtk( --version)?$/);
    }
    expect(runtime.commands[0].startsWith(`'/usr/local/bin/rtk'`)).toBe(true);
  });

  it('fails when the runtime state directory is not writable', async () => {
    const runtime = runtimeHarness({ stateExitCode: 1 });
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });

    expect(result).toMatchObject({ state: 'failed' });
    expect(result.reason).toContain(runtimeRtkStateDir(SESSION_A));
  });

  it('keeps concurrent sessions on separate state paths without touching process environment', async () => {
    const runtime = runtimeHarness();
    const service = serviceWith(toolsHarness());
    const before = { ...process.env };

    const [first, second] = await Promise.all([
      service.resolve({ sessionId: SESSION_A, runtime }),
      service.resolve({ sessionId: SESSION_B, runtime }),
    ]);

    expect(first.host?.env.RTK_DB_PATH).not.toBe(second.host?.env.RTK_DB_PATH);
    expect(first.runtime?.env.RTK_DB_PATH).not.toBe(second.runtime?.env.RTK_DB_PATH);
    expect({ ...process.env }).toEqual(before);
  });

  it('creates a writable host state directory', async () => {
    const runtime = runtimeHarness();
    const result = await serviceWith(toolsHarness()).resolve({ sessionId: SESSION_A, runtime });
    const stateDir = result.host && path.dirname(result.host.env.RTK_DB_PATH);

    expect(stateDir).toBe(hostRtkStateDir(SESSION_A));
    fs.mkdirSync(stateDir as string, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(stateDir as string, 'probe'), 'ok');
    expect(fs.readFileSync(path.join(stateDir as string, 'probe'), 'utf8')).toBe('ok');
  });
});

describe('rtk state paths', () => {
  it('encodes a session id so concurrent sessions cannot collide or escape the root', () => {
    expect(rtkSessionKey('grant-1:owner')).toBe('grant-1%3Aowner');
    expect(hostRtkStateDir('grant-1:owner').startsWith(testEnv.SERO_HOST_RTK_STATE_ROOT)).toBe(true);
    expect(runtimeRtkStateDir('grant-1:owner').startsWith('/tmp/sero-home/rtk/')).toBe(true);
    expect(() => rtkSessionKey('')).toThrow(/requires a session id/);
  });

  it('parses the rtk version output', () => {
    expect(parseRtkVersion('rtk 0.49.0\n')).toBe('0.49.0');
    expect(parseRtkVersion('0.49.0')).toBe('0.49.0');
    expect(parseRtkVersion('no version here')).toBeUndefined();
  });
});
