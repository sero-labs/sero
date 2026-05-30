import { existsSync, readFileSync } from 'fs';
import path from 'path';

import type {
  LoadExtensionsResult,
  PromptTemplate,
  ResourceDiagnostic,
  Skill,
  Theme,
} from '@earendil-works/pi-coding-agent';
import type { PluginCompatibilityStatus } from '@sero-ai/common';
import {
  extractPluginCompatibilityRequirements,
  hasPluginDeclaration,
} from '@electron/features/apps/discovery/plugin-meta';
import { evaluatePluginCompatibility } from './compatibility';

interface PluginPackageJson {
  sero?: {
    plugin?: unknown;
  };
}

const packageRootCache = new Map<string, string | null>();
const packageCompatibilityCache = new Map<string, PluginCompatibilityStatus | null>();

function findPackageRoot(resourcePath: string): string | null {
  const resolvedPath = path.resolve(resourcePath);
  const cached = packageRootCache.get(resolvedPath);
  if (cached !== undefined) return cached;

  let current = resolvedPath;
  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      packageRootCache.set(resolvedPath, current);
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      packageRootCache.set(resolvedPath, null);
      return null;
    }
    current = parent;
  }
}

function readPackageCompatibility(packageRoot: string): PluginCompatibilityStatus | null {
  const resolvedRoot = path.resolve(packageRoot);
  const cached = packageCompatibilityCache.get(resolvedRoot);
  if (cached !== undefined) return cached;

  try {
    const raw = readFileSync(path.join(resolvedRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as PluginPackageJson;
    if (!hasPluginDeclaration(pkg)) {
      packageCompatibilityCache.set(resolvedRoot, null);
      return null;
    }

    const requirements = extractPluginCompatibilityRequirements(pkg.sero?.plugin);
    const compatibility = requirements ? evaluatePluginCompatibility(requirements) : null;
    packageCompatibilityCache.set(resolvedRoot, compatibility);
    return compatibility;
  } catch {
    packageCompatibilityCache.set(resolvedRoot, null);
    return null;
  }
}

export function getPackageCompatibilityForResourcePath(
  resourcePath: string | undefined,
): PluginCompatibilityStatus | null {
  if (!resourcePath) return null;

  const packageRoot = findPackageRoot(resourcePath);
  if (!packageRoot) return null;
  return readPackageCompatibility(packageRoot);
}

export function isCompatiblePluginResourcePath(resourcePath: string | undefined): boolean {
  return getPackageCompatibilityForResourcePath(resourcePath)?.supported !== false;
}

function filterItemsByCompatibility<T>(
  items: T[],
  getPath: (item: T) => string | undefined,
): T[] {
  return items.filter((item) => isCompatiblePluginResourcePath(getPath(item)));
}

export function filterCompatiblePluginExtensions(base: LoadExtensionsResult): LoadExtensionsResult {
  return {
    ...base,
    extensions: filterItemsByCompatibility(base.extensions, (extension) => extension.resolvedPath),
  };
}

export function filterCompatiblePluginSkills(base: {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}): {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
} {
  return {
    ...base,
    skills: filterItemsByCompatibility(base.skills, (skill) => skill.filePath),
  };
}

export function filterCompatiblePluginPrompts(base: {
  prompts: PromptTemplate[];
  diagnostics: ResourceDiagnostic[];
}): {
  prompts: PromptTemplate[];
  diagnostics: ResourceDiagnostic[];
} {
  return {
    ...base,
    prompts: filterItemsByCompatibility(base.prompts, (prompt) => prompt.filePath),
  };
}

export function filterCompatiblePluginThemes(base: {
  themes: Theme[];
  diagnostics: ResourceDiagnostic[];
}): {
  themes: Theme[];
  diagnostics: ResourceDiagnostic[];
} {
  return {
    ...base,
    themes: filterItemsByCompatibility(base.themes, (theme) => theme.sourcePath),
  };
}

export function filterCompatiblePluginAgentsFiles(base: {
  agentsFiles: Array<{ path: string; content: string }>;
}): {
  agentsFiles: Array<{ path: string; content: string }>;
} {
  return {
    ...base,
    agentsFiles: filterItemsByCompatibility(base.agentsFiles, (file) => file.path),
  };
}

export function clearPackageCompatibilityCache(): void {
  packageRootCache.clear();
  packageCompatibilityCache.clear();
}
