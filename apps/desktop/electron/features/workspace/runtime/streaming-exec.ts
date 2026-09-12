import { spawn, type ChildProcess } from 'child_process';

import type { RuntimeExecOutputSink } from './types';

export interface StreamingExecOptions {
  program: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  sink: RuntimeExecOutputSink;
  spawnImpl?: typeof spawn;
}

export interface StreamingExecOutcome {
  exitCode: number;
  timedOut: boolean;
  /** True when the child could not be started at all. */
  spawnFailed: boolean;
  errorMessage?: string;
}

interface RenderedShellCommand {
  program: string;
  args: string[];
  nativeCwd?: string;
  env?: Record<string, string>;
}

/** Run a rendered shell command with streaming output and return status only. */
export async function runStreamingShellExec(options: {
  shell: RenderedShellCommand;
  timeoutMs: number;
  sink: RuntimeExecOutputSink;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const outcome = await runStreamingExec({
    program: options.shell.program,
    args: options.shell.args,
    cwd: options.shell.nativeCwd,
    env: options.shell.env,
    timeoutMs: options.timeoutMs,
    sink: options.sink,
  });
  return { stdout: '', stderr: outcome.errorMessage ?? '', exitCode: outcome.exitCode };
}

/**
 * Run a command and stream both pipes to a sink as the command runs.
 *
 * The sink owns the capture. This helper never accumulates output, so a command
 * larger than any in-memory ceiling is captured completely. The returned result
 * carries status only; the caller renders its payload from the sink's tail.
 */
export function runStreamingExec(options: StreamingExecOptions): Promise<StreamingExecOutcome> {
  return new Promise((resolve) => {
    const spawnImpl = options.spawnImpl ?? spawn;
    let child: ChildProcess;
    try {
      child = spawnImpl(options.program, options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ exitCode: 1, timedOut: false, spawnFailed: true, errorMessage: errorMessage(error) });
      return;
    }

    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => options.sink.write('stdout', chunk));
    child.stderr?.on('data', (chunk: string) => options.sink.write('stderr', chunk));

    const settle = (outcome: StreamingExecOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.sink.close();
      resolve(outcome);
    };

    child.on('error', (error) => {
      settle({ exitCode: 1, timedOut: false, spawnFailed: true, errorMessage: errorMessage(error) });
    });
    child.on('close', (code, signal) => {
      settle({
        exitCode: timedOut ? 124 : code ?? (signal ? 1 : 0),
        timedOut,
        spawnFailed: false,
      });
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
