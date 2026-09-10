/**
 * Deny tests for the built-in-only gate (architecture.md §3.6, §4.2).
 *
 * Discovery is mocked rather than run against the real repository: the gate's
 * whole claim is that it trusts a HOST-derived root and never the manifest, so
 * the tests own that root and plant imposters around it.
 */

import { mkdir, mkdtemp, realpath, symlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const discovery = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock('@electron/platform/protocols/builtin-resources', () => ({
  discoverBuiltinPluginPaths: () => discovery.paths,
}));

import {
  evaluateBuiltinGate,
  isPersistentSessionBuiltin,
  type BuiltinGateResult,
} from '@electron/features/apps/runtime/capabilities/persistent-sessions/builtin-gate';

/** The bundled directory name the allowlist maps `orchestrator` to. */
const BUNDLED_DIR = 'sero-orchestrator-plugin';
/** The bundled directory name the allowlist maps `architect` to. */
const ARCHITECT_DIR = 'sero-architect-plugin';

let bundledRoot = '';
let bundled = '';
let otherBuiltin = '';
let architectBundled = '';
let architectCopy = '';
let nestedUnderBundled = '';
let settingsPackagesCopy = '';
let devSessionCopy = '';
let linkToBundled = '';
let linkToImposter = '';
let defaultDiscovery: string[] = [];

beforeAll(async () => {
  // realpath first: macOS /var/folders is itself a symlink, and the gate
  // canonicalises both sides, so the fixture must compare against real paths.
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-builtin-gate-')));

  bundledRoot = path.join(tmp, 'plugins');
  bundled = path.join(bundledRoot, BUNDLED_DIR);
  nestedUnderBundled = path.join(bundled, 'nested');
  otherBuiltin = path.join(bundledRoot, 'sero-git-plugin');
  await mkdir(nestedUnderBundled, { recursive: true });
  await mkdir(otherBuiltin, { recursive: true });
  architectBundled = path.join(bundledRoot, ARCHITECT_DIR);
  architectCopy = path.join(tmp, 'dev-sessions', 'session-2', ARCHITECT_DIR);
  await mkdir(architectBundled, { recursive: true });
  await mkdir(architectCopy, { recursive: true });

  // Same directory name, different parent — the two non-installed discovery
  // sources that `isInstalledPluginPackagePath()` alone would not catch.
  settingsPackagesCopy = path.join(tmp, 'settings-packages', BUNDLED_DIR);
  devSessionCopy = path.join(tmp, 'dev-sessions', 'session-1', BUNDLED_DIR);
  await mkdir(settingsPackagesCopy, { recursive: true });
  await mkdir(devSessionCopy, { recursive: true });

  linkToBundled = path.join(tmp, 'link-to-bundled');
  linkToImposter = path.join(tmp, 'link-to-imposter');
  await symlink(bundled, linkToBundled);
  await symlink(settingsPackagesCopy, linkToImposter);

  defaultDiscovery = [bundled, otherBuiltin, architectBundled];
  discovery.paths = defaultDiscovery;
});

afterEach(() => {
  discovery.paths = defaultDiscovery;
});

function gate(appId: string, packagePath: string): BuiltinGateResult['reason'] | 'allowed' {
  const result = evaluateBuiltinGate({ appId, packagePath });
  return result.allowed ? 'allowed' : result.reason;
}

describe('evaluateBuiltinGate', () => {
  it('allows the bundled plugin at its canonical path', () => {
    expect(gate('orchestrator', bundled)).toBe('allowed');
    expect(isPersistentSessionBuiltin({ appId: 'orchestrator', packagePath: bundled })).toBe(true);
  });

  it('allows the bundled Architect plugin and denies a copy of it elsewhere', () => {
    expect(gate('architect', architectBundled)).toBe('allowed');
    expect(gate('architect', architectCopy)).toBe('package-path-mismatch');
    // The two allowlisted ids do not vouch for each other's directory.
    expect(gate('architect', bundled)).toBe('package-path-mismatch');
    expect(gate('orchestrator', architectBundled)).toBe('package-path-mismatch');
  });

  it('allows a symlink whose target is the bundled path', () => {
    // Equality is after resolution, so a legitimate symlinked checkout works.
    expect(gate('orchestrator', linkToBundled)).toBe('allowed');
  });

  it('denies a third-party plugin, whatever its path', () => {
    expect(gate('evil-app', bundled)).toBe('app-not-allowlisted');
    expect(gate('evil-app', settingsPackagesCopy)).toBe('app-not-allowlisted');
    expect(isPersistentSessionBuiltin({ appId: 'evil-app', packagePath: bundled })).toBe(false);
  });

  it('denies a settings.packages directory claiming an allowlisted app id', () => {
    expect(gate('orchestrator', settingsPackagesCopy)).toBe('package-path-mismatch');
  });

  it('denies a plugin dev session directory claiming an allowlisted app id', () => {
    expect(gate('orchestrator', devSessionCopy)).toBe('package-path-mismatch');
  });

  it('denies a symlink that resolves to an imposter directory', () => {
    expect(gate('orchestrator', linkToImposter)).toBe('package-path-mismatch');
  });

  it('denies a differently named directory inside the bundled root', () => {
    // Discovery de-duplicates by app id with last-write-wins, so a manifest in
    // the real root claiming `orchestrator` must still fail on its path.
    expect(gate('orchestrator', otherBuiltin)).toBe('package-path-mismatch');
  });

  it('denies a directory planted under the bundled path (equality, not prefix)', () => {
    expect(gate('orchestrator', nestedUnderBundled)).toBe('package-path-mismatch');
  });

  it('denies the bundled root itself', () => {
    expect(gate('orchestrator', bundledRoot)).toBe('package-path-mismatch');
  });

  it('denies a path that does not exist', () => {
    expect(gate('orchestrator', path.join(bundledRoot, 'missing', BUNDLED_DIR))).toBe(
      'package-path-mismatch',
    );
  });

  it('denies everything when the host discovers no bundled plugins', () => {
    discovery.paths = [];
    expect(gate('orchestrator', bundled)).toBe('bundled-root-unresolved');
  });

  it('denies when the expected directory is not one the host discovered', () => {
    discovery.paths = [otherBuiltin];
    expect(gate('orchestrator', bundled)).toBe('not-a-discovered-builtin');
  });
});
