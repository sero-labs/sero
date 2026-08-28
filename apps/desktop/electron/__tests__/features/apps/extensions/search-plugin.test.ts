import path from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

import {
  SEARCH_TOOL_NAMES,
  resolveSearchPluginPackagePath,
  searchPluginPackages,
} from '@electron/features/apps/extensions/search-plugin';

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
});
