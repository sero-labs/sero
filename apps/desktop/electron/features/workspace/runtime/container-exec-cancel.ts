import { randomUUID } from 'node:crypto';

import { shellQuote } from './backends/apple-container-utils';

/**
 * Lets a caller's stop reach a command running inside a container.
 *
 * Ending the local `docker exec` or `container exec` client does not end the
 * process it started: neither CLI forwards the kill. So the command runs in
 * its own session inside the container and writes its process group id to a
 * file there. A stop runs a second exec that kills that group, which takes
 * the shell and everything it started.
 *
 * A stop can arrive before the command has written its id. The stop leaves a
 * marker file first, and the command checks for the marker right after
 * writing its id, so one of the two always sees the other.
 *
 * `run` receives a script for `sh -c`. `innerShell` is how the backend
 * normally runs a command (`-lc` for a login shell). Without a signal there is
 * nothing to stop, so the command runs as before.
 */
export async function runCancellableInContainer<T>(options: {
  command: string;
  innerShell: '-c' | '-lc';
  signal?: AbortSignal;
  run: (script: string) => Promise<T>;
  killInside: (script: string) => Promise<unknown>;
}): Promise<T> {
  const { command, innerShell, signal } = options;
  if (!signal) return options.run(innerShell === '-c' ? command : `exec sh -lc ${shellQuote(command)}`);

  const pidFile = `/tmp/.sero-exec-${randomUUID()}`;
  const stopFile = `${pidFile}.stop`;
  const inner = [
    `echo $$ > ${pidFile}.tmp && mv ${pidFile}.tmp ${pidFile}`,
    `if [ -e ${stopFile} ]; then rm -f ${pidFile} ${stopFile}; exit 130; fi`,
    `sh ${innerShell} "$1"; s=$?; rm -f ${pidFile}; exit $s`,
  ].join('; ');
  // `-w` waits for the command, so the exec ends when it ends and keeps its exit code.
  const script = `exec setsid -w sh -c ${shellQuote(inner)} sero-exec ${shellQuote(command)}`;
  const kill = `touch ${stopFile}; if pid=$(cat ${pidFile} 2>/dev/null); then kill -KILL -"$pid" 2>/dev/null; rm -f ${pidFile} ${stopFile}; fi`;

  const onAbort = (): void => {
    void options.killInside(kill).catch((error: unknown) => {
      console.warn('[runtime] Could not stop a command inside the container:', error);
    });
  };
  // A signal that is already aborted never starts the command, so there is nothing to kill.
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await options.run(script);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
