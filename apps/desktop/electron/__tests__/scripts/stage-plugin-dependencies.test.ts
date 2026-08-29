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
function storePackage(
  name: string,
  id: string,
  manifest: Record<string, unknown> = {},
): string {
  const storeNodeModules = path.join(root, 'node_modules/.pnpm', id, 'node_modules');
  const packageDir = path.join(storeNodeModules, name);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, ...manifest }));
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
  it('stages a dependency together with its installed runtime dependencies', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0', {
      dependencies: { loader: '2.0.0' },
    });
    storePackage('loader', '@scope+engine@1.0.0');
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);

    const names = resolveDependencyStagingEntries(pluginNodeModules, '@scope/engine')
      .map((entry) => entry.name)
      .sort();

    expect(names).toEqual(['@scope/engine', 'loader']);
  });

  it('stages installed required peers but skips optional peers', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0', {
      peerDependencies: { runtime: '1.0.0', optional: '1.0.0' },
      peerDependenciesMeta: { optional: { optional: true } },
    });
    const runtime = storePackage('runtime', 'runtime@1.0.0');
    const optional = storePackage('optional', 'optional@1.0.0');
    const engineStore = path.join(root, 'node_modules/.pnpm/@scope+engine@1.0.0/node_modules');
    link(engineStore, 'runtime', runtime);
    link(engineStore, 'optional', optional);
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);

    const names = resolveDependencyStagingEntries(pluginNodeModules, '@scope/engine')
      .map((entry) => entry.name)
      .sort();

    expect(names).toEqual(['@scope/engine', 'runtime']);
  });

  it('follows the store graph so a peer brings its own dependencies', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0', {
      dependencies: { loader: '2.0.0' },
    });
    const loaderLink = storePackage('loader', 'loader@2.0.0', {
      optionalDependencies: { '@loader/native-linux-x64': '2.0.0' },
    });
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
      { name: 'plain', source: packageDir, destination: 'plain' },
    ]);
  });

  it('skips a dependency that is not installed for this platform', () => {
    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    fs.mkdirSync(pluginNodeModules, { recursive: true });

    expect(resolveDependencyStagingEntries(pluginNodeModules, '@scope/native-darwin-arm64')).toEqual([]);
  });
});

describe('resolvePluginStagingEntries', () => {
  it('keeps different versions below the packages that resolved them', () => {
    const engine = storePackage('@scope/engine', '@scope+engine@1.0.0', {
      dependencies: { shared: '1.0.0' },
    });
    const sharedOne = storePackage('shared', 'shared@1.0.0', { version: '1.0.0' });
    link(path.join(root, 'node_modules/.pnpm/@scope+engine@1.0.0/node_modules'), 'shared', sharedOne);
    const other = storePackage('other', 'other@1.0.0', {
      dependencies: { shared: '2.0.0' },
    });
    const sharedTwo = storePackage('shared', 'shared@2.0.0', { version: '2.0.0' });
    link(path.join(root, 'node_modules/.pnpm/other@1.0.0/node_modules'), 'shared', sharedTwo);

    const pluginNodeModules = path.join(root, 'plugin/node_modules');
    link(pluginNodeModules, '@scope/engine', engine);
    link(pluginNodeModules, 'other', other);

    const shared = resolvePluginStagingEntries(pluginNodeModules, ['@scope/engine', 'other'])
      .filter((entry) => entry.name === 'shared');

    expect(shared).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: sharedOne,
        destination: path.join('@scope/engine', 'node_modules', 'shared'),
      }),
      expect.objectContaining({
        source: sharedTwo,
        destination: path.join('other', 'node_modules', 'shared'),
      }),
    ]));
  });
});
