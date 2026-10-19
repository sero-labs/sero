/**
 * The automation browser's session: how a command names it, and what to do
 * when it stops answering.
 */

import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import { agentBrowserCommand } from './tools-browser-runtime-adapter';

function browserSessionName(workspaceId: string, backend: RuntimeBackend['backend']): string {
  return `sero-${workspaceId}-${backend}`;
}

export function sessionCommand(
  adapter: BrowserRuntimeAdapter,
  workspaceId: string,
  backend: RuntimeBackend['backend'],
  executablePath: string | null,
  args: string[],
  env?: Record<string, string | number | boolean | undefined>,
): string {
  return agentBrowserCommand(
    adapter,
    ['--session', browserSessionName(workspaceId, backend), ...(executablePath ? ['--executable-path', executablePath] : []), ...args],
    env,
    backend === 'host' ? process.platform : undefined,
  );
}

/** How every runtime backend reports a command it stopped at its time limit. */
export const COMMAND_TIMED_OUT = /^Command timed out after/;

/**
 * Stop a browser session whose daemon no longer answers.
 *
 * A page stuck in its own code blocks the daemon, and then `close` and `open`
 * hang as well: measured on a page in an endless loop, both waited out their
 * limit. Only stopping the daemon and its browser frees the session name, and
 * the next command starts a fresh one.
 */
/**
 * Whether the session still answers a question that needs no work from the
 * page. A slow command on a healthy page is left alone: only a session that
 * cannot answer this is reset.
 */
export async function browserSessionAnswers(runtime: RuntimeBackend, adapter: BrowserRuntimeAdapter, workspaceId: string, executablePath: string | null): Promise<boolean> {
  const probe = await runtime.exec({ command: sessionCommand(adapter, workspaceId, runtime.backend, executablePath, ['get', 'url', '--json']), timeoutMs: 5_000 })
    .catch(() => null);
  return probe !== null && !COMMAND_TIMED_OUT.test(probe.stderr);
}

export async function resetHungBrowserSession(runtime: RuntimeBackend, workspaceId: string): Promise<void> {
  const base = `"$HOME/.agent-browser/${browserSessionName(workspaceId, runtime.backend)}"`;
  // A Windows host runs commands in Git Bash, which has no `pkill`. `taskkill /T`
  // stops the daemon and the browser it started; the doubled slashes stop Git
  // Bash from rewriting the switches as paths.
  const stop = runtime.backend === 'host' && process.platform === 'win32'
    ? 'taskkill //PID "$pid" //T //F'
    : 'pkill -9 -P "$pid"; kill -9 "$pid"';
  const command = `pid=$(cat ${base}.pid 2>/dev/null); if [ -n "$pid" ]; then ${stop}; fi; rm -f ${base}.pid ${base}.sock ${base}.port`;
  await runtime.exec({ command, timeoutMs: 10_000 }).catch(() => undefined);
}
