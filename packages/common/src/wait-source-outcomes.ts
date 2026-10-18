/**
 * How a durable wait reads its source. The Architect owner and Goals both wait
 * on a managed process (a dev server Sero started or registered) or on the CI
 * checks of a branch or commit, so both decide an outcome the same way here.
 *
 * Each function is pure: the caller reads the source and saves the outcome.
 * Null means the source has not ended and the wait stays open.
 */

import type { AppRuntimeDevServer } from './app-runtime-dev-servers';
import type { AppRuntimeRefChecks } from './app-runtime-git';

export interface WaitSourceOutcome {
  kind: 'satisfied' | 'failed' | 'uncertain';
  detail: string;
}

/** Why a process wait cannot be registered on this server, or null when it can. */
export function processWaitRefusal(serverId: string, server: AppRuntimeDevServer | undefined): string | null {
  if (!server) return `No dev server "${serverId}" in this workspace. Wait on the id \`sero devserver list\` shows for a running server.`;
  if (server.status !== 'running' && server.status !== 'starting') return `Dev server "${serverId}" is already ${server.status}.`;
  return null;
}

/**
 * A server Sero no longer lists ended in a way nobody saw, for example across a
 * restart: that is uncertain, never success, and never a reason to start it again.
 */
export function processWaitOutcome(serverId: string, server: AppRuntimeDevServer | undefined): WaitSourceOutcome | null {
  if (!server) return { kind: 'uncertain', detail: `Sero no longer lists dev server ${serverId}, so how it ended is unknown. It is not started again.` };
  if (server.status === 'running' || server.status === 'starting') return null;
  if (server.status === 'stopped') return { kind: 'satisfied', detail: `Dev server ${serverId} was stopped.` };
  const exit = server.exit;
  if (exit?.exitCode === 0) return { kind: 'satisfied', detail: `Dev server ${serverId} exited with code 0.` };
  const how = exit?.signal ? `on signal ${exit.signal}` : typeof exit?.exitCode === 'number' ? `with code ${exit.exitCode}` : 'without a recorded exit code';
  return { kind: 'failed', detail: `Dev server ${serverId} exited ${how}.` };
}

/** Why a CI wait cannot be registered on this ref, or null when its checks could be read. */
export function ciWaitRefusal(ref: string, checks: AppRuntimeRefChecks): string | null {
  return checks.state === 'unknown' ? `Sero could not read the CI checks of "${ref}": ${checks.reason ?? 'unknown error'}.` : null;
}

/** Checks that have not all concluded, or that GitHub has not reported yet, leave the wait open. */
export function ciWaitOutcome(ref: string, checks: AppRuntimeRefChecks): WaitSourceOutcome | null {
  const at = checks.sha ? `${ref} (${checks.sha.slice(0, 12)})` : ref;
  if (checks.state === 'passed') return { kind: 'satisfied', detail: `All ${checks.checks.length} CI checks passed on ${at}.` };
  if (checks.state !== 'failed') return null;
  const failed = checks.checks.filter((check) => check.state === 'failed');
  const named = failed.slice(0, 5).map((check) => (check.url ? `${check.name} (${check.url})` : check.name)).join(', ');
  return { kind: 'failed', detail: `${failed.length} of ${checks.checks.length} CI checks failed on ${at}: ${named}${failed.length > 5 ? ', and more' : ''}.` };
}

/** How often a wait reads CI checks while one is open. GitHub's rate limit and the poller's floor set it. */
export const CI_WAIT_READ_INTERVAL_MS = 120_000;
