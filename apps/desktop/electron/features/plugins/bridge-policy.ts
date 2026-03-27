import { existsSync, readFileSync } from 'fs';
import path from 'path';

export type PluginBridgeToolsSetting = boolean | string[];

interface PluginBridgePolicy {
  bridgeAll: boolean;
  toolNames: Set<string>;
}

interface PluginPkgJson {
  sero?: {
    plugin?: {
      bridgeTools?: PluginBridgeToolsSetting;
    };
  };
}

const policyCache = new Map<string, PluginBridgePolicy | null>();

function findPackageRoot(filePath: string): string | null {
  let current = path.dirname(filePath);

  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    if (existsSync(packageJsonPath)) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseBridgePolicy(setting: PluginBridgeToolsSetting | undefined): PluginBridgePolicy {
  if (setting === false) {
    return { bridgeAll: false, toolNames: new Set() };
  }

  if (Array.isArray(setting)) {
    return {
      bridgeAll: false,
      toolNames: new Set(setting.filter((name): name is string => typeof name === 'string' && !!name)),
    };
  }

  return { bridgeAll: true, toolNames: new Set() };
}

export function getPluginBridgePolicy(extensionPath: string): PluginBridgePolicy | null {
  const resolvedPath = path.resolve(extensionPath);
  const cached = policyCache.get(resolvedPath);
  if (cached !== undefined) return cached;

  const packageRoot = findPackageRoot(resolvedPath);
  if (!packageRoot) {
    policyCache.set(resolvedPath, null);
    return null;
  }

  try {
    const raw = readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as PluginPkgJson;

    if (!pkg.sero?.plugin) {
      policyCache.set(resolvedPath, null);
      return null;
    }

    const policy = parseBridgePolicy(pkg.sero.plugin.bridgeTools);
    policyCache.set(resolvedPath, policy);
    return policy;
  } catch {
    policyCache.set(resolvedPath, null);
    return null;
  }
}

export function clearPluginBridgePolicyCache(): void {
  policyCache.clear();
}
