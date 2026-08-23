/**
 * The built-in-only gate shared by every gated app-runtime capability.
 *
 * `SERO_HOST_CAPABILITIES` is a COMPATIBILITY list — it tells a plugin whether
 * this host build supports a capability and grants nothing. And
 * `isInstalledPluginPackagePath()` is NOT a sufficient gate on its own: an app
 * discovered from an arbitrary `settings.json` `packages` entry, or from a
 * plugin dev session, is not under the installed-plugins dir, so that test
 * returns false for it — while the app id it claims comes from its own
 * package.json. "Not installed" is not proof of "built-in".
 *
 * The gate here is canonical path equality against a HOST-DERIVED bundled root
 * (`discoverBuiltinPluginPaths()` — the monorepo `plugins/` in a source run, the
 * packaged `builtin/plugins` in a release). A directory that merely claims
 * `sero.app.id: "orchestrator"` resolves to a different path and is refused.
 *
 * `SERO_DEV_PLUGINS` does not weaken this: it only decides whether a built-in
 * plugin's UI is served from its dev port, and changes no package path.
 */

import { realpathSync } from 'fs';
import path from 'path';

import { discoverBuiltinPluginPaths } from '@electron/platform/protocols/builtin-resources';

/** realpath, falling back to a lexical resolve when the path does not exist. */
function canonical(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

export interface BuiltinGateInput {
  appId: string;
  packagePath: string;
}

export interface BuiltinGateResult {
  allowed: boolean;
  /** Stable reason code — asserted in tests, logged on denial, never shown raw to a user. */
  reason?:
    | 'app-not-allowlisted'
    | 'bundled-root-unresolved'
    | 'package-path-mismatch'
    | 'not-a-discovered-builtin';
}

/**
 * Decides whether an app may hold a gated capability, given the capability's own
 * allowlist of `appId -> bundled directory name`.
 *
 * Both checks must pass, and both are derived from host code rather than from
 * the app's own manifest:
 *   1. the resolved package path equals the canonical bundled path for that id;
 *   2. that path is one the host itself discovered as a bundled plugin (which
 *      also applies `isBuiltinPackageDir`).
 */
export function evaluateBuiltinAppGate(
  input: BuiltinGateInput,
  allowlist: Readonly<Record<string, string>>,
): BuiltinGateResult {
  const expectedDirName = allowlist[input.appId];
  if (!expectedDirName) return { allowed: false, reason: 'app-not-allowlisted' };

  const discovered = discoverBuiltinPluginPaths();
  if (discovered.length === 0) return { allowed: false, reason: 'bundled-root-unresolved' };

  const resolvedPackagePath = canonical(input.packagePath);
  const expected = discovered.find((candidate) => path.basename(candidate) === expectedDirName);
  if (!expected) return { allowed: false, reason: 'not-a-discovered-builtin' };

  // Exact equality, never a prefix test: a prefix test would accept a nested
  // directory planted under the bundled root.
  if (canonical(expected) !== resolvedPackagePath) {
    return { allowed: false, reason: 'package-path-mismatch' };
  }

  return { allowed: true };
}
