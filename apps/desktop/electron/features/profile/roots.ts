/**
 * Shared Sero root resolution.
 *
 * The profile registry and the machine-level host artifacts live under a fixed
 * Sero root. Both `features/profile/manager.ts` and `platform/env/index.ts`
 * need that root, so the resolution lives here once.
 *
 * ⚠️  This module is imported by env.ts at process startup. Do not import
 *     anything that reads SERO_HOME or SERO_AGENT_DIR at module level.
 *
 * Test safety: a test process must never resolve the machine's real
 * `~/.sero-ui`. Under a test runner the resolver requires an explicit override
 * and throws otherwise, so an accidental real-root write fails loudly instead
 * of wiping live data.
 */

import os from 'os';
import path from 'path';

/** True when the current process is a test runner. */
function isTestRunner(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

function refuseRealRoot(label: string, overrides: string[]): never {
  throw new Error(
    `Refusing to resolve the ${label} from the home directory under a test runner. `
    + `Set ${overrides.join(' or ')} to a temporary directory.`,
  );
}

/**
 * Resolve the fixed Sero root that holds `profiles.json`.
 *
 * Priority:
 * 1. `SERO_FIXED_ROOT_OVERRIDE` (only honoured under a test runner)
 * 2. `SERO_HOME_OVERRIDE` (source-dev and test isolation)
 * 3. `~/.sero-ui`
 */
export function resolveSeroRoot(): string {
  if (isTestRunner() && process.env.SERO_FIXED_ROOT_OVERRIDE) {
    return path.resolve(process.env.SERO_FIXED_ROOT_OVERRIDE);
  }
  if (process.env.SERO_HOME_OVERRIDE) {
    return path.resolve(process.env.SERO_HOME_OVERRIDE);
  }
  if (isTestRunner()) {
    refuseRealRoot('Sero root', ['SERO_FIXED_ROOT_OVERRIDE', 'SERO_HOME_OVERRIDE']);
  }
  return path.join(os.homedir(), '.sero-ui');
}

/**
 * Resolve the machine-level host artifacts root shared by all profiles.
 *
 * Priority:
 * 1. `SERO_FIXED_ROOT_OVERRIDE` (only honoured under a test runner)
 * 2. `SERO_HOST_ARTIFACTS_ROOT_OVERRIDE`
 * 3. `~/.sero-ui`
 */
export function resolveHostArtifactsRoot(): string {
  if (isTestRunner() && process.env.SERO_FIXED_ROOT_OVERRIDE) {
    return path.resolve(process.env.SERO_FIXED_ROOT_OVERRIDE);
  }
  if (process.env.SERO_HOST_ARTIFACTS_ROOT_OVERRIDE) {
    return path.resolve(process.env.SERO_HOST_ARTIFACTS_ROOT_OVERRIDE);
  }
  if (isTestRunner()) {
    refuseRealRoot('host artifacts root', [
      'SERO_FIXED_ROOT_OVERRIDE',
      'SERO_HOST_ARTIFACTS_ROOT_OVERRIDE',
    ]);
  }
  return path.join(os.homedir(), '.sero-ui');
}
