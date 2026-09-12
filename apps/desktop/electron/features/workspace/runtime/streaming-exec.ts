import { spawn, type ChildProcess } from 'child_process';
import type { Readable } from 'stream';

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
 * larger than any in-memory ceiling is captured completely, and it pauses a pipe
 * when the sink reports that it cannot keep up. The returned result carries
 * status only; the caller renders its payload from the sink's tail.
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

    // Chunks stay as bytes so the sink can persist the command's output exactly.
    // A sink that needs text decodes it itself.
    const pipeToSink = (source: Readable | null, stream: 'stdout' | 'stderr'): void => {
      if (!source) return;
      source.on('data', (chunk: Buffer) => {
        const pending = options.sink.write(stream, chunk);
        if (!pending) return;
        // The sink is holding its maximum unwritten output. Stop reading this
        // pipe until it catches up. The kernel pipe buffer then fills and the
        // child blocks, so memory stays bounded and no output is dropped.
        source.pause();
        void pending.then(() => { if (!settled) source.resume(); });
      });
    };

    pipeToSink(child.stdout, 'stdout');
    pipeToSink(child.stderr, 'stderr');

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
