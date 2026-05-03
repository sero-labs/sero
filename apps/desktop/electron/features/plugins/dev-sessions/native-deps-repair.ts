import { spawn } from 'child_process';

const REPAIR_TIMEOUT_MS = 120_000;
const REPAIR_OUTPUT_LIMIT = 4_000;

const NATIVE_OPTIONAL_DEP_FAILURE_PATTERNS = [
  /Cannot start service: Host version "[^"]+" does not match binary version "[^"]+"/,
  /You installed esbuild for another platform than the one you're currently using/,
  /Specifically the "@esbuild\/[^" ]+" package is present but this platform needs the "@esbuild\/[^" ]+" package instead/,
  /Cannot find module ['"]@rollup\/rollup-[^'"]+['"]/,
  /Cannot find module @rollup\/rollup-[^\s]+/,
];

export interface PluginNativeDepsRepairResult {
  ok: boolean;
  output: string;
}

export function isNativeOptionalDependencyFailure(output: string): boolean {
  return NATIVE_OPTIONAL_DEP_FAILURE_PATTERNS.some((pattern) => pattern.test(output));
}

export async function repairPluginNativeDeps(sourcePath: string): Promise<PluginNativeDepsRepairResult> {
  return await new Promise((resolve) => {
    let settled = false;
    let output = '';
    let timeout: NodeJS.Timeout | undefined;

    const appendOutput = (chunk: unknown): void => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
      output = `${output}\n${text}`.slice(-REPAIR_OUTPUT_LIMIT * 2);
    };

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok, output: trimRepairOutput(output) });
    };

    const child = spawn('pnpm', ['install', '--force'], {
      cwd: sourcePath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    timeout = setTimeout(() => {
      appendOutput(`Timed out after ${REPAIR_TIMEOUT_MS / 1000}s while running pnpm install --force.`);
      child.kill('SIGTERM');
      finish(false);
    }, REPAIR_TIMEOUT_MS);

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);
    child.on('error', (error) => {
      appendOutput(error.message);
      finish(false);
    });
    child.on('exit', (code) => finish(code === 0));
  });
}

function trimRepairOutput(output: string): string {
  return output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-REPAIR_OUTPUT_LIMIT);
}
