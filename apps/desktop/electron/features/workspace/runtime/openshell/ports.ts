import { formatOpenShellFailure, runOpenShell } from './cli';

const DEFAULT_FORWARD_TIMEOUT_MS = 30_000;

export interface ForwardedPort {
  runtimePort: number;
  localPort: number;
  localUrl: string;
  status: 'ready' | 'error';
}

export interface OpenShellForwardPortInput {
  gatewayName: string;
  sandboxName: string;
  port: number;
  timeoutMs?: number;
}

export async function startOpenShellPortForward(
  input: OpenShellForwardPortInput,
): Promise<ForwardedPort> {
  const result = await runOpenShell([
    '--gateway', input.gatewayName,
    'forward', 'start', String(input.port), input.sandboxName, '-d',
  ], { timeoutMs: input.timeoutMs ?? DEFAULT_FORWARD_TIMEOUT_MS });

  if (result.exitCode !== 0) {
    throw new Error(formatOpenShellFailure('forward OpenShell port', result));
  }

  const parsedUrl = parseForwardedLocalUrl(result.stdout) ?? parseForwardedLocalUrl(result.stderr);
  return {
    runtimePort: input.port,
    localPort: parsedUrl?.port ?? input.port,
    localUrl: parsedUrl?.url ?? `http://127.0.0.1:${input.port}`,
    status: 'ready',
  };
}

export function parseForwardedLocalUrl(output: string): { url: string; port: number } | null {
  const match = output.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/i);
  if (!match) return null;
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return { url: `http://127.0.0.1:${port}`, port };
}
