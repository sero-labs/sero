import { describe, expect, it, vi } from 'vitest';
import { runHostDoctorChecks } from '@electron/features/workspace/runtime/backends/host/host-doctor';
import type { HostToolResolverLike } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import type { ToolInstallReason, ToolName, ToolResolution, ToolStatus } from '@electron/features/workspace/runtime/toolchains/types';

const ALL_TOOLS: ToolName[] = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash', 'rg', 'fd', 'jq', 'gh', 'curl', 'zip', 'unzip'];

describe('Host Doctor checks', () => {
  it('reports ready core tools and does not use raw command-v probes', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({ platform: 'linux', tools, now: clock() });

    expect(results.map((result) => result.id)).toEqual([
      'runtime.host.core-tools',
      'runtime.host.shell',
      'runtime.host.git',
      'runtime.host.ssh',
      'runtime.host.node',
      'runtime.host.sero-cli',
      'runtime.host.small-tools',
      'runtime.host.browser',
      'runtime.host.process-management',
      'runtime.host.native-build-tools',
    ]);
    expect(tools.status).toHaveBeenCalledTimes(13);
    expect(results.find((result) => result.id === 'runtime.host.core-tools')).toMatchObject({
      status: 'pass',
      details: { installState: 'ready' },
    });
    expect(results.find((result) => result.id === 'runtime.host.sero-cli')).toMatchObject({
      status: 'fail',
      details: { installState: 'failed', remediationAction: 'seroCliBridge.restart', blocking: true },
    });
    expect(results.find((result) => result.id === 'runtime.host.browser')).toMatchObject({
      status: 'warn',
      details: { installState: 'installable', remediationAction: 'browserPack.ensure' },
    });
  });

  it('reports Sero CLI bridge readiness from injected status', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({
      platform: 'linux',
      tools,
      seroCliBridge: { state: 'ready' },
      now: clock(),
    });

    expect(results.find((result) => result.id === 'runtime.host.sero-cli')).toMatchObject({
      status: 'pass',
      message: 'Sero CLI bridge is ready for host commands.',
      details: { installState: 'ready', blocking: true },
    });
  });

  it('reports injected Sero CLI bridge startup failures as blocking', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({
      platform: 'linux',
      tools,
      seroCliBridge: { state: 'failed', message: 'Sero CLI bridge is not available for host commands: bind failed' },
      now: clock(),
    });

    expect(results.find((result) => result.id === 'runtime.host.sero-cli')).toMatchObject({
      status: 'fail',
      message: 'Sero CLI bridge is not available for host commands: bind failed',
      details: { installState: 'failed', remediationAction: 'seroCliBridge.restart', blocking: true },
    });
  });

  it('reports missing/installing core tools with managed remediation metadata', async () => {
    const statuses: Record<string, ToolStatus> = Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)]));
    statuses.node = missing('node');
    statuses.pnpm = installing('pnpm');
    const tools = mockTools(statuses);

    const results = await runHostDoctorChecks({ platform: 'darwin', tools, now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.core-tools')).toMatchObject({
      status: 'warn',
      details: {
        installState: 'installing',
        remediationAction: 'toolchain.ensureCore',
        installable: true,
      },
    });
    expect(results.find((result) => result.id === 'runtime.host.node')).toMatchObject({
      status: 'warn',
      details: { installState: 'missing', remediationAction: 'toolchain.ensure:node', installable: true },
    });
  });

  it('resolves host doctor checks on Windows', async () => {
    const statuses: Record<string, ToolStatus> = Object.fromEntries(ALL_TOOLS.map((tool) => [tool, tool === 'bash' ? missing(tool) : ready(tool)]));
    const results = await runHostDoctorChecks({ platform: 'win32', tools: mockTools(statuses), now: clock() });

    expect(results.find((result) => result.id === 'runtime.host.shell')).toMatchObject({
      status: 'warn',
      details: { installState: 'missing', remediationAction: 'toolchain.ensure', installable: true },
    });
    expect(results.find((result) => result.id === 'runtime.host.native-build-tools')).toMatchObject({
      status: 'warn',
      details: { blocking: false, remediationAction: 'nativeBuildTools.showInstructions' },
    });
  });

  it('reports browser installable and native build tools as informational', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({
      platform: 'linux',
      tools,
      browser: { state: 'installable' },
      nativeBuildTools: { state: 'missing', tools: ['gcc', 'make'] },
      now: clock(),
    });

    expect(results.find((result) => result.id === 'runtime.host.browser')).toMatchObject({
      status: 'warn',
      details: { installState: 'installable', installable: true, remediationAction: 'browserPack.ensure' },
    });
    expect(results.find((result) => result.id === 'runtime.host.native-build-tools')).toMatchObject({
      status: 'warn',
      details: { installState: 'missing', blocking: false, tools: ['gcc', 'make'] },
    });
  });

  it('reports unavailable browser pack artifacts as non-installable', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({
      tools,
      browser: { state: 'missing', message: 'Browser pack unavailable.' },
      now: clock(),
    });

    expect(results.find((result) => result.id === 'runtime.host.browser')).toMatchObject({
      status: 'warn',
      message: 'Browser pack unavailable.',
      details: { installState: 'missing', installable: false, remediationAction: 'browserPack.unavailable' },
    });
  });

  it('passes browser launch failure details through for actionable fallback', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const results = await runHostDoctorChecks({
      platform: 'linux',
      tools,
      browser: {
        state: 'failed',
        message: 'Chromium could not launch because required Linux shared libraries are missing.',
        details: {
          reason: 'linux-shared-libraries-missing',
          remediationAction: 'browserPack.showLinuxDependencies',
          containerFallback: true,
        },
      },
      now: clock(),
    });

    expect(results.find((result) => result.id === 'runtime.host.browser')).toMatchObject({
      status: 'fail',
      details: {
        installState: 'failed',
        reason: 'linux-shared-libraries-missing',
        remediationAction: 'browserPack.showLinuxDependencies',
        containerFallback: true,
      },
    });
  });

  it('reports process management unknown or ready without Unix-only hard failures', async () => {
    const tools = mockTools(Object.fromEntries(ALL_TOOLS.map((tool) => [tool, ready(tool)])));

    const unknown = await runHostDoctorChecks({ platform: 'win32', tools, now: clock() });
    const readyResult = await runHostDoctorChecks({
      platform: 'win32',
      tools,
      processManagement: { state: 'ready' },
      now: clock(),
    });

    expect(unknown.find((result) => result.id === 'runtime.host.process-management')).toMatchObject({
      status: 'warn',
      details: { installState: 'unknown', blocking: false },
    });
    expect(readyResult.find((result) => result.id === 'runtime.host.process-management')).toMatchObject({
      status: 'pass',
      details: { installState: 'ready', adapter: 'available' },
    });
  });
});

function mockTools(statuses: Record<string, ToolStatus>): HostToolResolverLike {
  return {
    resolve: vi.fn(async (tool: ToolName) => {
      const status = statuses[tool];
      return status?.state === 'ready' ? status : null;
    }),
    ensure: vi.fn(async (tool: ToolName, _reason: ToolInstallReason) => ready(tool)),
    status: vi.fn(async (tool: ToolName) => statuses[tool] ?? missing(tool)),
    prepareEnv: vi.fn(async (env?: Record<string, string>) => env ?? {}),
    prepareShell: vi.fn(async (_reason: ToolInstallReason) => ready('bash')),
    prepareProgram: vi.fn(async (program: string, _reason: ToolInstallReason) => program),
    resolveTerminalShell: vi.fn(async (candidate: string | undefined, _reason: ToolInstallReason) => candidate ?? '/bin/bash'),
  };
}

function ready(tool: ToolName): ToolStatus & ToolResolution {
  return { tool, state: 'ready', source: 'system', path: `/usr/bin/${tool}`, version: '1.0.0' };
}

function missing(tool: ToolName): ToolStatus {
  return {
    tool,
    state: 'missing',
    error: {
      code: 'TOOL_REQUIRED',
      message: `${tool} is required`,
      tool,
      retryable: true,
      installable: true,
    },
  };
}

function installing(tool: ToolName): ToolStatus {
  return { tool, state: 'installing' };
}

function clock(): () => number {
  let value = 1000;
  return () => {
    value += 10;
    return value;
  };
}
