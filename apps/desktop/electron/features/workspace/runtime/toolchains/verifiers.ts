import { execFile } from 'child_process';

import type { ToolName, ToolSource, ToolStatus } from './types';

export interface ToolVerifierCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  errorCode?: string;
  timedOut?: boolean;
}

export type ToolVerifierRunner = (
  program: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<ToolVerifierCommandResult>;

export interface ToolVerifierOptions {
  source?: ToolSource;
  requiredVersion?: string;
  timeoutMs?: number;
  run?: ToolVerifierRunner;
}

interface ToolProbe {
  args: string[];
  minVersion?: string;
  parseVersion: (output: string) => string | undefined;
  smokeArgs?: string[];
  smokeOutput?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

const TOOL_PROBES: Record<ToolName, ToolProbe> = {
  node: { args: ['--version'], minVersion: '22.0.0', parseVersion: parseLeadingVersion },
  npm: { args: ['--version'], minVersion: '10.0.0', parseVersion: parseLeadingVersion },
  pnpm: { args: ['--version'], minVersion: '9.0.0', parseVersion: parseLeadingVersion },
  git: { args: ['--version'], minVersion: '2.30.0', parseVersion: parseFirstVersion },
  ssh: { args: ['-V'], parseVersion: parseOpenSshVersion },
  bash: {
    args: ['--version'],
    minVersion: '3.2.0',
    parseVersion: parseFirstVersion,
    smokeArgs: ['-lc', 'printf sero-bash-ok'],
    smokeOutput: 'sero-bash-ok',
  },
  rg: { args: ['--version'], parseVersion: parseFirstVersion },
  fd: { args: ['--version'], parseVersion: parseFirstVersion },
  jq: { args: ['--version'], parseVersion: parseFirstVersion },
  gh: { args: ['--version'], parseVersion: parseFirstVersion },
  curl: { args: ['--version'], parseVersion: parseFirstVersion },
  zip: { args: ['--version'], parseVersion: parseFirstVersion },
  unzip: { args: ['-v'], parseVersion: parseFirstVersion },
};

export async function verifyTool(
  tool: ToolName,
  candidate: string = tool,
  options: ToolVerifierOptions = {},
): Promise<ToolStatus> {
  const probe = TOOL_PROBES[tool];
  const source = options.source ?? 'system';
  const requiredVersion = options.requiredVersion ?? probe.minVersion;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = options.run ?? runVerifierCommand;
  const result = await run(candidate, probe.args, { timeoutMs });

  if (isMissing(result)) return missingStatus(tool, source, candidate, 'Tool executable was not found.');
  if (result.timedOut) return failedStatus(tool, source, candidate, 'Tool verification timed out.', true);
  if (result.exitCode !== 0) {
    return failedStatus(tool, source, candidate, 'Tool version probe failed.', false, result.stderr);
  }

  const output = `${result.stdout}\n${result.stderr}`;
  const version = probe.parseVersion(output);
  if (requiredVersion && (!version || !satisfiesMinimum(version, requiredVersion))) {
    return {
      tool,
      state: 'incompatible',
      source,
      path: candidate,
      version,
      requiredVersion,
      error: {
        code: 'TOOL_VERSION_INCOMPATIBLE',
        message: `${tool} ${version ?? 'unknown'} does not satisfy required version ${requiredVersion}.`,
        tool,
        retryable: false,
        installable: source === 'system',
      },
    };
  }

  if (probe.smokeArgs) {
    const smoke = await run(candidate, probe.smokeArgs, { timeoutMs });
    if (isMissing(smoke)) return missingStatus(tool, source, candidate, 'Tool executable was not found.');
    if (smoke.timedOut) return failedStatus(tool, source, candidate, 'Tool smoke test timed out.', true);
    if (smoke.exitCode !== 0 || (probe.smokeOutput && smoke.stdout !== probe.smokeOutput)) {
      return failedStatus(tool, source, candidate, 'Tool smoke test failed.', false, smoke.stderr);
    }
  }

  return { tool, state: 'ready', source, path: candidate, version };
}

export const verifyNode = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('node', candidate, options);
export const verifyNpm = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('npm', candidate, options);
export const verifyPnpm = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('pnpm', candidate, options);
export const verifyGit = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('git', candidate, options);
export const verifySsh = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('ssh', candidate, options);
export const verifyBash = (candidate: string, options?: ToolVerifierOptions): Promise<ToolStatus> =>
  verifyTool('bash', candidate, options);

export async function verifyTools(
  tools: ToolName[],
  candidates: Partial<Record<ToolName, string>> = {},
  options: ToolVerifierOptions = {},
): Promise<Record<ToolName, ToolStatus>> {
  const entries = await Promise.all(
    tools.map(async (tool) => [tool, await verifyTool(tool, candidates[tool] ?? tool, options)] as const),
  );
  return Object.fromEntries(entries) as Record<ToolName, ToolStatus>;
}

export function satisfiesMinimum(version: string, minimum: string): boolean {
  const actual = parseVersionParts(version);
  const required = parseVersionParts(minimum);
  for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
    const actualPart = actual[index] ?? 0;
    const requiredPart = required[index] ?? 0;
    if (actualPart > requiredPart) return true;
    if (actualPart < requiredPart) return false;
  }
  return true;
}

function runVerifierCommand(
  program: string,
  args: string[],
  options: { timeoutMs: number },
): Promise<ToolVerifierCommandResult> {
  return new Promise((resolve) => {
    execFile(program, args, { timeout: options.timeoutMs }, (error, stdout, stderr) => {
      const status = error as NodeJS.ErrnoException | null;
      const errorCode = typeof status?.code === 'string' ? status.code : undefined;
      resolve({
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? status?.message ?? ''),
        exitCode: typeof status?.code === 'number' ? status.code : status ? 1 : 0,
        errorCode,
        timedOut: errorCode === 'ETIMEDOUT',
      });
    });
  });
}

function missingStatus(tool: ToolName, source: ToolSource, candidate: string, message: string): ToolStatus {
  return {
    tool,
    state: 'missing',
    source,
    path: candidate,
    error: { code: 'TOOL_REQUIRED', message, tool, retryable: true, installable: source === 'system' },
  };
}

function failedStatus(
  tool: ToolName,
  source: ToolSource,
  candidate: string,
  message: string,
  retryable: boolean,
  stderr?: string,
): ToolStatus {
  return {
    tool,
    state: 'failed',
    source,
    path: candidate,
    error: {
      code: 'TOOL_INSTALL_FAILED',
      message,
      tool,
      retryable,
      installable: source === 'system',
      details: stderr ? { stderr } : undefined,
    },
  };
}

function isMissing(result: ToolVerifierCommandResult): boolean {
  return result.errorCode === 'ENOENT' || result.errorCode === 'ENOTDIR';
}

function parseLeadingVersion(output: string): string | undefined {
  return output.trim().replace(/^v/, '').match(/^(\d+\.\d+\.\d+)/)?.[1];
}

function parseFirstVersion(output: string): string | undefined {
  return output.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];
}

function parseOpenSshVersion(output: string): string | undefined {
  return output.match(/OpenSSH[_ ](\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? parseFirstVersion(output);
}

function parseVersionParts(version: string): number[] {
  return version.split(/[.+-]/).map((part) => Number.parseInt(part, 10)).filter(Number.isFinite);
}
