import { runCommand, runOpenShell, type OpenShellCommandResult } from './cli';

export type OpenShellPrerequisiteName = 'openshell-cli' | 'docker-cli' | 'docker-daemon';
export type OpenShellHealthStatus = 'ready' | 'unavailable';

export interface OpenShellPrerequisiteCheck {
  name: OpenShellPrerequisiteName;
  ok: boolean;
  status: OpenShellHealthStatus;
  message: string;
  version?: string;
  result: OpenShellCommandResult;
}

export interface OpenShellRuntimeHealth {
  ok: boolean;
  status: OpenShellHealthStatus;
  message: string;
  checks: OpenShellPrerequisiteCheck[];
}

export async function checkOpenShellCli(): Promise<OpenShellPrerequisiteCheck> {
  const result = await runOpenShell(['--version'], { timeoutMs: 10_000 });
  if (result.exitCode === 0) {
    const version = firstLine(result.stdout || result.stderr);
    return {
      name: 'openshell-cli',
      ok: true,
      status: 'ready',
      message: version ? `OpenShell CLI detected: ${version}` : 'OpenShell CLI detected.',
      version,
      result,
    };
  }

  return {
    name: 'openshell-cli',
    ok: false,
    status: 'unavailable',
    message: `OpenShell CLI not found or not executable. ${result.stderr}`,
    result,
  };
}

export async function checkDockerDaemon(): Promise<OpenShellPrerequisiteCheck> {
  const result = await runCommand('Docker daemon prerequisite', 'docker', [
    'info',
    '--format',
    '{{json .ServerVersion}}',
  ], { timeoutMs: 10_000 });

  if (result.exitCode === 0) {
    const version = firstLine(result.stdout).replace(/^"|"$/g, '');
    return {
      name: 'docker-daemon',
      ok: true,
      status: 'ready',
      message: version ? `Docker daemon is running: ${version}` : 'Docker daemon is running.',
      version,
      result,
    };
  }

  const missingCli = result.stderr.includes('command not found') || result.stderr.includes('ENOENT');
  if (missingCli) {
    return {
      name: 'docker-cli',
      ok: false,
      status: 'unavailable',
      message: `Docker CLI not found. Install Docker and ensure the docker command is on PATH. ${result.stderr}`,
      result,
    };
  }

  return {
    name: 'docker-daemon',
    ok: false,
    status: 'unavailable',
    message: `Docker daemon is not running or is unreachable. Start Docker Desktop or the Docker daemon. ${result.stderr}`,
    result,
  };
}

export async function checkOpenShellPrerequisites(): Promise<OpenShellRuntimeHealth> {
  const cli = await checkOpenShellCli();
  if (!cli.ok) {
    return { ok: false, status: 'unavailable', message: cli.message, checks: [cli] };
  }

  const docker = await checkDockerDaemon();
  const checks = [cli, docker];
  if (!docker.ok) {
    return { ok: false, status: 'unavailable', message: docker.message, checks };
  }

  return {
    ok: true,
    status: 'ready',
    message: 'OpenShell Local prerequisites are ready.',
    checks,
  };
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] ?? '';
}
