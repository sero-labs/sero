import { execFile } from 'child_process';
import type { DoctorResult, DoctorStatus } from '@electron/features/doctor/engine/types';
import { extractWslDistro } from './wsl-paths';

export interface HostDoctorCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type HostDoctorRunner = (program: string, args: string[], options?: { timeoutMs?: number }) => Promise<HostDoctorCommandResult>;

export interface HostDoctorOptions {
  platform?: NodeJS.Platform;
  workspacePath?: string;
  run?: HostDoctorRunner;
  now?: () => number;
}

export async function runHostDoctorChecks(options: HostDoctorOptions = {}): Promise<DoctorResult[]> {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runHostDoctorCommand;
  if (platform === 'win32') return runWindowsHostDoctor({ ...options, platform, run });
  return runPosixHostDoctor({ ...options, platform, run });
}

function runHostDoctorCommand(program: string, args: string[], options: { timeoutMs?: number } = {}): Promise<HostDoctorCommandResult> {
  return new Promise((resolve) => {
    execFile(program, args, { timeout: options.timeoutMs ?? 5_000 }, (error, stdout, stderr) => {
      const status = error as NodeJS.ErrnoException | null;
      resolve({
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? status?.message ?? ''),
        exitCode: typeof status?.code === 'number' ? status.code : status ? 1 : 0,
      });
    });
  });
}

async function runPosixHostDoctor(options: Required<Pick<HostDoctorOptions, 'platform' | 'run'>> & HostDoctorOptions): Promise<DoctorResult[]> {
  return [
    await checkCommand('runtime.host.bash', 'Host bash is available.', 'Host bash is not available on PATH.', options.run, 'bash', ['--version'], options.now),
    await checkCommand('runtime.host.git', 'Host git is available.', 'Host git is not available on PATH.', options.run, 'git', ['--version'], options.now),
    await checkCommand('runtime.host.shell', 'Host bash can execute commands.', 'Host bash could not execute a smoke command.', options.run, 'bash', ['-c', 'echo ok'], options.now),
  ];
}

async function runWindowsHostDoctor(options: Required<Pick<HostDoctorOptions, 'platform' | 'run'>> & HostDoctorOptions): Promise<DoctorResult[]> {
  const distro = options.workspacePath ? extractWslDistro(options.workspacePath) : null;
  const distroArgs = distro ? ['-d', distro] : [];
  return [
    await checkCommand('runtime.host.wsl', 'wsl.exe is available.', 'wsl.exe is not available on PATH. Windows host runtime requires WSL 2.', options.run, 'wsl.exe', ['--version'], options.now),
    await checkCommand('runtime.host.wslStatus', 'WSL status is healthy.', 'wsl.exe --status failed. Windows host runtime requires a working WSL 2 installation.', options.run, 'wsl.exe', ['--status'], options.now),
    await checkCommand('runtime.host.wslEcho', 'WSL distro can execute commands.', 'The selected WSL distro could not execute a smoke command.', options.run, 'wsl.exe', [...distroArgs, '--', 'echo', 'ok'], options.now),
    await checkCommand('runtime.host.wslBash', 'WSL bash is available.', 'The selected WSL distro does not have bash on PATH.', options.run, 'wsl.exe', [...distroArgs, '--', 'which', 'bash'], options.now),
  ];
}

async function checkCommand(
  id: string,
  passMessage: string,
  failMessage: string,
  run: HostDoctorRunner,
  program: string,
  args: string[],
  now?: () => number,
): Promise<DoctorResult> {
  const start = mark(now);
  const result = await run(program, args, { timeoutMs: 5_000 });
  const ok = result.exitCode === 0;
  return makeHostResult(id, ok ? 'pass' : 'fail', ok ? passMessage : failMessage, start, now, ok ? undefined : {
    program,
    args,
    stderr: result.stderr,
    stdout: result.stdout,
  });
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
