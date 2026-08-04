import { existsSync, readFileSync } from 'fs';
import path from 'path';

import type {
  PluginCompatibilityIssue,
  PluginCompatibilityStatus,
} from '@sero-ai/common';
import { SERO_HOST_CAPABILITIES, SERO_PLUGIN_RUNTIME_ABI } from '@sero-ai/common';

interface DesktopPackageJson {
  version?: string;
}

export interface SeroHostCompatibilityContext {
  hostVersion: string;
  capabilities: ReadonlySet<string>;
}

interface PluginCompatibilityRequirements {
  minSeroVersion?: string;
  requiredHostCapabilities?: readonly string[];
  /**
   * Set only for plugins that ship a federated UI. Plugins that contribute just
   * tools or an extension have no remoteEntry to be incompatible, so they are
   * exempt from the ABI check entirely.
   */
  federatedUi?: { runtimeAbi?: number };
}

let desktopPackageVersion: string | null = null;

const DESKTOP_PACKAGE_JSON_CANDIDATES = [
  // Source/runtime path when this module executes from apps/desktop/electron/features/plugins/
  path.resolve(__dirname, '../../../package.json'),
  // Bundled main-process path when esbuild inlines modules into dist/electron/main.mjs
  path.resolve(__dirname, '../../package.json'),
  // Dev/test launches keep cwd at apps/desktop/.
  path.resolve(process.cwd(), 'package.json'),
];

function getElectronAppPackageJsonCandidates(): string[] {
  try {
    const electronModule = require('electron') as { app?: { getAppPath?: () => string } } | string;
    if (typeof electronModule !== 'object' || electronModule === null) {
      return [];
    }

    const appPath = electronModule.app?.getAppPath?.();
    if (!appPath) return [];

    return [
      path.resolve(appPath, '../package.json'),
      path.resolve(appPath, '../../package.json'),
    ];
  } catch {
    return [];
  }
}

function getDesktopPackageVersion(): string {
  if (desktopPackageVersion) return desktopPackageVersion;

  const candidates = [
    ...getElectronAppPackageJsonCandidates(),
    ...DESKTOP_PACKAGE_JSON_CANDIDATES,
  ];
  const seen = new Set<string>();

  for (const packageJsonPath of candidates) {
    if (seen.has(packageJsonPath)) continue;
    seen.add(packageJsonPath);
    if (!existsSync(packageJsonPath)) continue;

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as DesktopPackageJson;
    const version = typeof pkg.version === 'string' ? pkg.version.trim() : '';
    if (version) {
      desktopPackageVersion = version;
      return desktopPackageVersion;
    }
  }

  desktopPackageVersion = '0.0.0';
  return desktopPackageVersion;
}

function stripVersionBuildMetadata(version: string): string {
  return version.trim().split('+', 1)[0]?.trim() ?? version.trim();
}

function isElectronRuntimeVersion(version: string): boolean {
  const electronVersion = process.versions.electron?.trim();
  if (!electronVersion) return false;
  return stripVersionBuildMetadata(version) === electronVersion;
}

function getRuntimeElectronVersion(): string | null {
  try {
    const electronModule = require('electron') as { app?: { getVersion?: () => string } } | string;
    if (typeof electronModule === 'object' && electronModule !== null) {
      const version = electronModule.app?.getVersion?.();
      const normalized = typeof version === 'string' ? version.trim() : '';
      if (normalized && normalized !== '0.0.0' && !isElectronRuntimeVersion(normalized)) {
        return normalized;
      }
    }
  } catch {
    // Fall back to the desktop package version in non-Electron contexts (tests, tooling).
  }

  return null;
}

export function getSeroHostCompatibilityContext(): SeroHostCompatibilityContext {
  return {
    hostVersion: getRuntimeElectronVersion() ?? getDesktopPackageVersion(),
    capabilities: new Set<string>(SERO_HOST_CAPABILITIES),
  };
}

function parseVersion(version: string): number[] | null {
  const normalized = version.trim();
  if (!normalized) return null;

  const main = normalized.split(/[+-]/, 1)[0]?.trim() ?? '';
  if (!/^\d+(?:\.\d+){0,2}$/.test(main)) {
    return null;
  }

  return main.split('.').map((part) => Number(part));
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;

  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function minVersionIssue(minSeroVersion: string, hostVersion: string): PluginCompatibilityIssue {
  return {
    kind: 'minSeroVersion',
    expected: minSeroVersion,
    actual: hostVersion,
    message: `Requires Sero ${minSeroVersion} or newer (current host: ${hostVersion}).`,
  };
}

/**
 * A plugin built against a different Module Federation line cannot share React
 * with this host, so it would crash on its first hook rather than fail visibly.
 * Report it as an incompatibility so the host can say what to do instead.
 */
function runtimeAbiIssue(pluginAbi: number | undefined): PluginCompatibilityIssue {
  return {
    kind: 'pluginRuntimeAbi',
    expected: String(SERO_PLUGIN_RUNTIME_ABI),
    actual: pluginAbi === undefined ? 'none' : String(pluginAbi),
    message: pluginAbi === undefined
      ? 'Built for an older version of Sero. Reinstall the plugin to update it.'
      : `Built for a different version of Sero (plugin UI runtime ${pluginAbi}, host expects ${SERO_PLUGIN_RUNTIME_ABI}). Reinstall the plugin to update it.`,
  };
}

function missingCapabilityIssue(capability: string): PluginCompatibilityIssue {
  return {
    kind: 'requiredHostCapability',
    capability,
    expected: capability,
    message: `Requires host capability \`${capability}\`, which this Sero build does not provide.`,
  };
}

export function evaluatePluginCompatibility(
  plugin: PluginCompatibilityRequirements | null | undefined,
  context: SeroHostCompatibilityContext = getSeroHostCompatibilityContext(),
): PluginCompatibilityStatus | null {
  if (!plugin) return null;

  const issues: PluginCompatibilityIssue[] = [];
  const hostVersion = context.hostVersion;

  if (plugin.minSeroVersion) {
    const comparison = compareVersions(hostVersion, plugin.minSeroVersion);
    if (comparison === null || comparison < 0) {
      issues.push(minVersionIssue(plugin.minSeroVersion, hostVersion));
    }
  }

  if (plugin.federatedUi && plugin.federatedUi.runtimeAbi !== SERO_PLUGIN_RUNTIME_ABI) {
    issues.push(runtimeAbiIssue(plugin.federatedUi.runtimeAbi));
  }

  for (const capability of plugin.requiredHostCapabilities ?? []) {
    if (!context.capabilities.has(capability)) {
      issues.push(missingCapabilityIssue(capability));
    }
  }

  return {
    supported: issues.length === 0,
    hostVersion,
    issues,
  };
}

export function assertPluginCompatible(
  plugin: PluginCompatibilityRequirements | null | undefined,
  context: SeroHostCompatibilityContext = getSeroHostCompatibilityContext(),
): void {
  const compatibility = evaluatePluginCompatibility(plugin, context);
  if (!compatibility || compatibility.supported) return;

  throw new Error(compatibility.issues.map((issue) => issue.message).join(' '));
}
