/**
 * The one shared lock-directory name for a state file: `<stateFile>.lock`.
 *
 * Every writer of one state file must derive its lock from this rule — the
 * host's `AppStateManager` and every plugin extension — or they hold two
 * mutexes and exclude nothing. It lives in its own dependency-free module so
 * browser bundles that only need the name (a plugin UI building its paths
 * object) can import it without pulling Node-only code.
 */
export function stateLockPath(stateFile: string): string {
  return `${stateFile}.lock`;
}
