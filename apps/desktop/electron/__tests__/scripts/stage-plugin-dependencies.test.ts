import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  resolveDependencyStagingEntries,
  resolvePluginStagingEntries,
} from '../../../scripts/stage-plugin-dependencies.mjs';

let root: string;

/** Writes a package into a pnpm-style virtual store and returns its directory. */
function storePackage(name: string, id: string): string {
  const storeNodeModules = path.join(root, 'node_modules/.pnpm', id, 'node_modules');
  const packageDir = path.join(storeNodeModules, name);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name }));
  return packageDir;
}

/** Links `target` into a `node_modules` directory under `name`. */
function link(nodeModules: string, name: string, target: string): void {
  const linkPath = path.join(nodeModules, name);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, 'dir');
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sero-stage-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveDependencyStagingEntries', () => {
  it('stages a dependency together with the peers in its store directory', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0');
    storePackage('loader', '@scope+engine@1.0.0');
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);

    const names = resolveDependencyStagingEntries(pluginNodeModules, '@scope/engine')
      .map((entry) => entry.name)
      .sort();

    expect(names).toEqual(['@scope/engine', 'loader']);
  });

  it('follows the store graph so a peer brings its own dependencies', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0');
    const loaderLink = storePackage('loader', 'loader@2.0.0');
    storePackage('@loader/native-linux-x64', 'loader@2.0.0');
    link(path.join(root, 'node_modules/.pnpm/@scope+engine@1.0.0/node_modules'), 'loader', loaderLink);

    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);

    const names = resolveDependencyStagingEntries(pluginNodeModules, '@scope/engine')
      .map((entry) => entry.name)
      .sort();

    expect(names).toEqual(['@loader/native-linux-x64', '@scope/engine', 'loader']);
  });

  it('stages a plain installed directory as itself', () => {
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    const packageDir = path.join(pluginNodeModules, 'plain');
    fs.mkdirSync(packageDir, { recursive: true });

    expect(resolveDependencyStagingEntries(pluginNodeModules, 'plain')).toEqual([
      { name: 'plain', source: packageDir },
    ]);
  });

  it('skips a dependency that is not installed for this platform', () => {
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    fs.mkdirSync(pluginNodeModules, { recursive: true });

    expect(resolveDependencyStagingEntries(pluginNodeModules, '@scope/native-darwin-arm64')).toEqual([]);
  });
});

describe('resolvePluginStagingEntries', () => {
  it('de-duplicates a package two dependencies both pull in', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0');
    const shared = storePackage('shared', '@scope+engine@1.0.0');
    const other = storePackage('other', 'other@1.0.0');
    link(path.join(root, 'node_modules/.pnpm/other@1.0.0/node_modules'), 'shared', shared);

    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);
    link(pluginNodeModules, 'other', other);

    const names = resolvePluginStagingEntries(pluginNodeModules, ['@scope/engine', 'other'])
      .map((entry) => entry.name);

    expect(names.filter((name) => name === 'shared')).toHaveLength(1);
  });
});
