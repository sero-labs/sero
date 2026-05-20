import type { DoctorResult, DoctorStatus } from '@electron/features/doctor/engine/types';
import { createHostToolResolver } from '../../toolchains/host-tool-resolver';
import type { HostToolResolverLike } from '../../toolchains/host-tool-resolver';
import type { ToolName, ToolStatus } from '../../toolchains/types';
import { getSeroCliBridgeConnection, managedSeroCliBinDir } from '@electron/cli/host-bridge/state';

const CORE_TOOLS: ToolName[] = ['node', 'npm', 'pnpm', 'git', 'ssh', 'bash'];
const SMALL_TOOLS: ToolName[] = ['rg', 'fd', 'jq', 'gh', 'curl', 'zip', 'unzip'];

type InstallState = 'ready' | 'installing' | 'missing' | 'failed' | 'incompatible' | 'installable' | 'unknown';
type ExternalReadiness = 'ready' | 'missing' | 'unknown' | 'failed';

export interface HostDoctorOptions {
  platform?: NodeJS.Platform;
  workspacePath?: string;
  now?: () => number;
  tools?: Pick<HostToolResolverLike, 'status'>;
  browser?: { state: 'ready' | 'installable' | 'missing' | 'installing' | 'failed'; message?: string; details?: Record<string, string | number | boolean | null> };
  processManagement?: { state: 'ready' | 'unknown' | 'failed'; message?: string };
  nativeBuildTools?: { state: ExternalReadiness; tools?: string[]; message?: string };
  seroCliBridge?: { state: 'ready' | 'failed'; message?: string };
}

export async function runHostDoctorChecks(options: HostDoctorOptions = {}): Promise<DoctorResult[]> {
  const platform = options.platform ?? process.platform;
  const tools = options.tools ?? createHostToolResolver({ platform });
  const statusByTool = await collectToolStatuses(tools);
  return [
    makeToolGroupResult('runtime.host.core-tools', CORE_TOOLS, statusByTool, options.now),
    makeSingleToolResult('runtime.host.shell', 'bash', statusByTool.get('bash'), options.now),
    makeSingleToolResult('runtime.host.git', 'git', statusByTool.get('git'), options.now),
    makeSingleToolResult('runtime.host.ssh', 'ssh', statusByTool.get('ssh'), options.now),
    makeSingleToolResult('runtime.host.node', 'node', statusByTool.get('node'), options.now),
    makeSeroCliResult(options.seroCliBridge, options.now),
    makeToolGroupResult('runtime.host.small-tools', SMALL_TOOLS, statusByTool, options.now),
    makeBrowserResult(options.browser, options.now),
    makeProcessManagementResult(options.processManagement, options.now),
    makeNativeBuildToolsResult(platform, options.nativeBuildTools, options.now),
  ];
}

async function collectToolStatuses(tools: Pick<HostToolResolverLike, 'status'>): Promise<Map<ToolName, ToolStatus>> {
  const entries = await Promise.all([...CORE_TOOLS, ...SMALL_TOOLS].map(async (tool) => [tool, await tools.status(tool)] as const));
  return new Map(entries);
}

function makeToolGroupResult(id: string, tools: ToolName[], statuses: Map<ToolName, ToolStatus>, now?: () => number): DoctorResult {
  const start = mark(now);
  const toolStatuses = tools.map((tool) => statuses.get(tool)).filter(isToolStatus);
  const installState = summarizeToolInstallState(toolStatuses);
  const readyCount = toolStatuses.filter((status) => status.state === 'ready').length;
  const status = installState === 'ready' ? 'pass' : installState === 'failed' ? 'fail' : 'warn';
  const label = id.endsWith('core-tools') ? 'Core host tools' : 'Small host tools';
  return makeHostResult(id, status, `${label}: ${readyCount}/${tools.length} ready.`, start, now, {
    installState,
    tools: toolStatuses.map(toolStatusDetail),
    remediationAction: id.endsWith('core-tools') ? 'toolchain.ensureCore' : 'toolchain.ensure',
    installable: toolStatuses.some(isInstallable),
  });
}

function makeSingleToolResult(id: string, tool: ToolName, status: ToolStatus | undefined, now?: () => number): DoctorResult {
  const start = mark(now);
  const installState = status ? toolInstallState(status) : 'unknown';
  const doctorStatus = installState === 'ready' ? 'pass' : installState === 'failed' ? 'fail' : 'warn';
  return makeHostResult(id, doctorStatus, toolMessage(tool, installState), start, now, {
    installState,
    tool: status ? toolStatusDetail(status) : { tool, state: 'unknown' },
    remediationAction: tool === 'bash' ? 'toolchain.ensure' : `toolchain.ensure:${tool}`,
    installable: status ? isInstallable(status) : false,
  });
}

function makeSeroCliResult(bridge: HostDoctorOptions['seroCliBridge'], now?: () => number): DoctorResult {
  const start = mark(now);
  const state = bridge?.state ?? (getSeroCliBridgeConnection() ? 'ready' : 'failed');
  return makeHostResult(
    'runtime.host.sero-cli',
    state === 'ready' ? 'pass' : 'fail',
    bridge?.message ?? (state === 'ready' ? 'Sero CLI bridge is ready for host commands.' : 'Sero CLI bridge is not available for host commands.'),
    start,
    now,
    {
      installState: state,
      binDir: managedSeroCliBinDir(),
      remediationAction: 'seroCliBridge.restart',
      blocking: true,
    },
  );
}

function makeBrowserResult(browser: HostDoctorOptions['browser'], now?: () => number): DoctorResult {
  const start = mark(now);
  const state = browser?.state ?? 'installable';
  const status: DoctorStatus = state === 'ready' ? 'pass' : state === 'failed' ? 'fail' : 'warn';
  return makeHostResult('runtime.host.browser', status, browser?.message ?? browserMessage(state), start, now, {
    ...browser?.details,
    installState: state,
    remediationAction: browser?.details?.remediationAction ?? (state === 'missing' ? 'browserPack.unavailable' : 'browserPack.ensure'),
    installable: state === 'installable',
  });
}

function makeProcessManagementResult(processManagement: HostDoctorOptions['processManagement'], now?: () => number): DoctorResult {
  const start = mark(now);
  const state = processManagement?.state ?? 'unknown';
  return makeHostResult('runtime.host.process-management', state === 'ready' ? 'pass' : state === 'failed' ? 'fail' : 'warn', processManagement?.message ?? processMessage(state), start, now, {
    installState: state,
    adapter: state === 'ready' ? 'available' : 'pending',
    blocking: false,
  });
}

function makeNativeBuildToolsResult(platform: NodeJS.Platform, nativeBuildTools: HostDoctorOptions['nativeBuildTools'], now?: () => number): DoctorResult {
  const start = mark(now);
  const state = nativeBuildTools?.state ?? 'unknown';
  return makeHostResult('runtime.host.native-build-tools', state === 'ready' ? 'pass' : 'warn', nativeBuildTools?.message ?? nativeBuildToolsMessage(platform, state), start, now, {
    installState: state,
    tools: nativeBuildTools?.tools ?? [],
    blocking: false,
    remediationAction: 'nativeBuildTools.showInstructions',
    containerFallback: true,
  });
}

function summarizeToolInstallState(statuses: ToolStatus[]): InstallState {
  if (statuses.every((status) => status.state === 'ready')) return 'ready';
  if (statuses.some((status) => status.state === 'installing')) return 'installing';
  if (statuses.some((status) => status.state === 'failed')) return 'failed';
  if (statuses.some((status) => status.state === 'incompatible')) return 'incompatible';
  if (statuses.some(isInstallable)) return 'missing';
  return 'unknown';
}

function toolInstallState(status: ToolStatus): InstallState {
  if (status.state === 'missing' && isInstallable(status)) return 'missing';
  return status.state;
}

function isInstallable(status: ToolStatus): boolean {
  return 'error' in status && status.error?.installable === true;
}

function isToolStatus(status: ToolStatus | undefined): status is ToolStatus {
  return status !== undefined;
}

function toolStatusDetail(status: ToolStatus): Record<string, unknown> {
  return {
    tool: status.tool,
    state: status.state,
    source: status.source,
    path: status.path,
    version: status.version,
    requiredVersion: status.state === 'incompatible' ? status.requiredVersion : undefined,
    installable: isInstallable(status),
    errorCode: 'error' in status ? status.error?.code : undefined,
    errorMessage: 'error' in status ? status.error?.message : undefined,
  };
}

function toolMessage(tool: ToolName, state: InstallState): string {
  if (state === 'ready') return `Host ${tool} is ready.`;
  if (state === 'installing') return `Host ${tool} is installing.`;
  if (state === 'incompatible') return `Host ${tool} is incompatible and can use a managed toolchain.`;
  if (state === 'failed') return `Host ${tool} installation or verification failed.`;
  return `Host ${tool} is missing and can use a managed toolchain.`;
}

function browserMessage(state: string): string {
  if (state === 'ready') return 'Host browser automation is ready.';
  if (state === 'installing') return 'Host browser automation pack is installing.';
  if (state === 'failed') return 'Host browser automation pack failed verification.';
  if (state === 'missing') return 'Host browser automation pack is unavailable for this machine.';
  return 'Host browser automation pack is not installed yet.';
}

function processMessage(state: string): string {
  if (state === 'ready') return 'Host process management adapter is ready.';
  if (state === 'failed') return 'Host process management adapter failed.';
  return 'Host process management adapter checks are pending platform adapter integration.';
}

function nativeBuildToolsMessage(platform: NodeJS.Platform, state: ExternalReadiness): string {
  if (state === 'ready') return 'Native build tools appear to be available.';
  if (platform === 'win32') return 'Native build tools are optional. Install Visual Studio Build Tools if a project needs native compilation.';
  if (platform === 'darwin') return 'Native build tools are optional. Install Xcode Command Line Tools if a project needs native compilation.';
  return 'Native build tools are optional. Install your distribution build-essential/compiler packages if a project needs native compilation.';
}

function makeHostResult(
  id: string,
  status: DoctorStatus,
  message: string,
  start: number,
  now?: () => number,
  details?: Record<string, unknown>,
): DoctorResult {
  return { id, category: 'runtime', status, message, details, durationMs: mark(now) - start };
}

function mark(now?: () => number): number {
  return now ? now() : Date.now();
}
