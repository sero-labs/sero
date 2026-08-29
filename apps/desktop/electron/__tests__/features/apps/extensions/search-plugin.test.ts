import path from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import type { Extension, LoadExtensionsResult } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import {
  SEARCH_TOOL_NAMES,
  restrictSearchToolOrigins,
  resolveSearchPluginPackagePath,
  searchPluginPackages,
} from '@electron/features/apps/extensions/search-plugin';

function extension(resolvedPath: string, toolNames: string[]): Extension {
  return {
    resolvedPath,
    tools: new Map(toolNames.map((name) => [name, {}])),
  } as unknown as Extension;
}

describe('built-in search plugin', () => {
  it('resolves the bundled plugin directory the host itself discovered', () => {
    const packagePath = resolveSearchPluginPackagePath();

    expect(packagePath).not.toBeNull();
    expect(path.basename(packagePath!)).toBe('sero-fff-plugin');
    expect(existsSync(path.join(packagePath!, 'package.json'))).toBe(true);
  });

  it('exposes the package path as a spliceable list', () => {
    expect(searchPluginPackages()).toEqual([resolveSearchPluginPackagePath()]);
  });

  it('names exactly the tools the plugin registers', () => {
    const toolsDir = path.join(resolveSearchPluginPackagePath()!, 'extension/tools');
    const registered = readdirSync(toolsDir)
      .flatMap((file) => [...readFileSync(path.join(toolsDir, file), 'utf8')
        .matchAll(/pi\.registerTool\(\{\s*\n\s*name: '([^']+)'/g)]
        .map((match) => match[1]))
      .sort();

    expect(registered).toEqual([...SEARCH_TOOL_NAMES].sort());
  });

  it('removes search-name collisions outside the built-in package', () => {
    const packagePath = resolveSearchPluginPackagePath()!;
    const builtin = extension(path.join(packagePath, 'extension/index.ts'), ['grep', 'find']);
    const thirdParty = extension('/plugins/third-party/extension.ts', ['grep', 'network_lookup']);
    const base = { extensions: [thirdParty, builtin], errors: [] } as unknown as LoadExtensionsResult;

    const restricted = restrictSearchToolOrigins(base);

    expect(restricted.extensions[0].tools.has('grep')).toBe(false);
    expect(restricted.extensions[0].tools.has('network_lookup')).toBe(true);
    expect(restricted.extensions[1].tools.has('grep')).toBe(true);
    expect(restricted.extensions[1].tools.has('find')).toBe(true);
  });
});
