import { runCommand, type OpenShellCommandResult } from './cli';
import type { OpenShellRemoteGatewayEntry } from './remote-gateway-registry';

export type OpenShellRemoteCheckStatus = 'ready' | 'unavailable' | 'unsupported';

export interface OpenShellRemoteCheckResult {
  ok: boolean;
  status: OpenShellRemoteCheckStatus;
  message: string;
  result?: OpenShellCommandResult;
  version?: string;
}

export type OpenShellRemoteGatewayTarget = Pick<
  OpenShellRemoteGatewayEntry,
  'name' | 'sshKeyPath' | 'port'
> & {
  sshHost?: string;
};

const PHASE_5_REMOTE_MESSAGE =
  'OpenShell Remote currently requires an SSH destination like user@host. Endpoint-only and cloud gateways are Phase 5.';

export function getUnsupportedRemoteGatewayResult(): OpenShellRemoteCheckResult {
  return {
    ok: false,
    status: 'unsupported',
    message: PHASE_5_REMOTE_MESSAGE,
  };
}

export function hasSupportedSshDestination(
  entry: OpenShellRemoteGatewayTarget,
): entry is OpenShellRemoteGatewayTarget & { sshHost: string } {
  return /^\S+@\S+$/.test(entry.sshHost?.trim() ?? '');
}

export function buildRemoteSshArgs(
  entry: OpenShellRemoteGatewayTarget & { sshHost: string },
  remoteCommand: string[],
): string[] {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    ...(entry.sshKeyPath ? ['-i', entry.sshKeyPath] : []),
    entry.sshHost,
    ...remoteCommand,
  ];
}

export async function checkRemoteDocker(
  entry: OpenShellRemoteGatewayTarget,
): Promise<OpenShellRemoteCheckResult> {
  if (!hasSupportedSshDestination(entry)) return getUnsupportedRemoteGatewayResult();

  const result = await runCommand(
    'remote Docker prerequisite',
    'ssh',
    buildRemoteSshArgs(entry, ['docker', 'info', '--format', '{{json .ServerVersion}}']),
    { timeoutMs: 15_000 },
  );

  if (result.exitCode === 0) {
    const version = result.stdout.trim().replace(/^"|"$/g, '');
    return {
      ok: true,
      status: 'ready',
      message: version ? `Remote Docker is running: ${version}` : 'Remote Docker is running.',
      version,
      result,
    };
  }

  return {
    ok: false,
    status: 'unavailable',
    message: `Remote Docker is unavailable over non-interactive SSH. Ensure SSH key/agent auth works and Docker is running on the remote host. ${result.stderr}`,
    result,
  };
}
