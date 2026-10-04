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
  /** Stops the command and everything it started. */
  signal?: AbortSignal;
  spawnImpl?: typeof spawn;
}

export interface StreamingExecOutcome {
  exitCode: number;
  timedOut: boolean;
  /** True when the caller stopped the command. */
  aborted?: boolean;
  /** True when the child could not be started at all. */
  spawnFailed: boolean;
  errorMessage?: string;
}

/** How long the last output may take to arrive after the process has ended. */
const EXIT_DRAIN_MS = 500;
/** The shell convention for a command ended by an interrupt. */
const ABORTED_EXIT_CODE = 130;

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
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const outcome = await runStreamingExec({
    program: options.shell.program,
    args: options.shell.args,
    cwd: options.shell.nativeCwd,
    env: options.shell.env,
    timeoutMs: options.timeoutMs,
    sink: options.sink,
    signal: options.signal,
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
 *
 * The command ends when its process ends. A command can leave a process behind
 * that still holds the output pipes (a shell that started a server in the
 * background), so the pipes may never close. The run does not wait for them:
 * a short time after the process ends it returns, and what the leftover process
 * writes later is read and dropped so that process never blocks on a full pipe.
 *
 * A time limit or a stop from the caller ends the whole process group, not only
 * the shell, so a server the shell started in the foreground ends with it.
 */
export function runStreamingExec(options: StreamingExecOptions): Promise<StreamingExecOutcome> {
  return new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve({ exitCode: ABORTED_EXIT_CODE, timedOut: false, aborted: true, spawnFailed: false });
      return;
    }
    const spawnImpl = options.spawnImpl ?? spawn;
    let child: ChildProcess;
    try {
      child = spawnImpl(options.program, options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Its own process group, so the group can be ended as one.
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      resolve({ exitCode: 1, timedOut: false, spawnFailed: true, errorMessage: errorMessage(error) });
      return;
    }

    let timedOut = false;
    let aborted = false;
    let settled = false;
    let drain: ReturnType<typeof setTimeout> | null = null;
    const killGroup = (): void => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, options.timeoutMs);
    const onAbort = (): void => {
      aborted = true;
      killGroup();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    // Chunks stay as bytes so the sink can persist the command's output exactly.
    // A sink that needs text decodes it itself.
    const pipeToSink = (source: Readable | null, stream: 'stdout' | 'stderr'): void => {
      if (!source) return;
      source.on('data', (chunk: Buffer) => {
        if (settled) return;
        const pending = options.sink.write(stream, chunk);
        if (!pending) return;
        // The sink is holding its maximum unwritten output. Stop reading this
        // pipe until it catches up. The kernel pipe buffer then fills and the
        // child blocks, so memory stays bounded and no output is dropped.
        source.pause();
        void pending.then(() => source.resume());
      });
    };

    pipeToSink(child.stdout, 'stdout');
    pipeToSink(child.stderr, 'stderr');

    const settle = (outcome: StreamingExecOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (drain) clearTimeout(drain);
      options.signal?.removeEventListener('abort', onAbort);
      child.stdout?.resume();
      child.stderr?.resume();
      options.sink.close();
      resolve(outcome);
    };
    const outcomeOf = (code: number | null, signal: NodeJS.Signals | null): StreamingExecOutcome => ({
      exitCode: aborted ? ABORTED_EXIT_CODE : timedOut ? 124 : code ?? (signal ? 1 : 0),
      timedOut,
      ...(aborted ? { aborted: true } : {}),
      spawnFailed: false,
    });

    child.on('error', (error) => {
      settle({ exitCode: 1, timedOut: false, spawnFailed: true, errorMessage: errorMessage(error) });
    });
    child.on('exit', (code, signal) => {
      drain = setTimeout(() => settle(outcomeOf(code, signal)), EXIT_DRAIN_MS);
    });
    child.on('close', (code, signal) => settle(outcomeOf(code, signal)));
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
