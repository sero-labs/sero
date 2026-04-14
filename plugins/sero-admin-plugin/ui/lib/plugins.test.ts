import { describe, expect, it } from 'vitest';
import type { InstalledPlugin } from '@sero/common';
import { normalizeInstallSource, sortInstalledPlugins } from './plugins';

function createPlugin(id: string, name: string): InstalledPlugin {
  return {
    id,
    name,
    version: '1.0.0',
    description: null,
    source: `npm:${id}`,
    packagePath: `/tmp/${id}`,
    category: 'developer-tools',
    icon: 'box',
    tags: [],
    installedAt: null,
    hasUI: true,
  };
}

describe('plugin manager helpers', () => {
  it('sorts installed plugins by name without mutating the original list', () => {
    const original = [
      createPlugin('b', 'Zulu'),
      createPlugin('a', 'Alpha'),
    ];

    const sorted = sortInstalledPlugins(original);

    expect(sorted.map((plugin) => plugin.name)).toEqual(['Alpha', 'Zulu']);
    expect(original.map((plugin) => plugin.name)).toEqual(['Zulu', 'Alpha']);
  });

  it('normalizes install sources before the hook validates them', () => {
    expect(normalizeInstallSource('  npm:@sero/plugin-demo@latest  ')).toBe(
      'npm:@sero/plugin-demo@latest',
    );
    expect(normalizeInstallSource('   ')).toBeNull();
  });
});
