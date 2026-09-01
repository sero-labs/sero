import { execFile, type ExecFileOptions } from 'node:child_process';

import { seroOwnedProcesses } from '@electron/features/git/worktree/pool/owned-processes';

interface TrackedExecResult {
  stdout: string;
  stderr: string;
}

let nextCommandId = 0;

/** Runs a host command while exposing its owner-confirmed stop to slot reuse. */
export function trackedExecFile(
  workspaceId: string,
  cwd: string,
  program: string,
  args: string[],
  options: ExecFileOptions,
): Promise<TrackedExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(program, args, options, (error, stdout, stderr) => {
      unregister();
      if (error) {
        Object.assign(error, { stdout, stderr });
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
    const id = `command:${workspaceId}:${child.pid ?? 'pending'}:${nextCommandId += 1}`;
    let exited = false;
    const closed = new Promise<void>((resolveClosed) => {
      child.once('close', () => {
        exited = true;
        resolveClosed();
      });
    });
    const unregister = seroOwnedProcesses.register({
      id,
      kind: 'command',
      cwd,
      async stop() {
        if (!exited) child.kill('SIGTERM');
        await closed;
      },
    });
  });
}
