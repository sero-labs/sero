#!/usr/bin/env node

import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '../..');
const workspaceYamlPath = path.join(repoRoot, 'pnpm-workspace.yaml');
const distDir = path.join(packageDir, 'dist', 'npm');
const packageJsonPath = path.join(packageDir, 'package.json');

async function loadWorkspaceCatalogs() {
  const raw = await fs.readFile(workspaceYamlPath, 'utf8');
  const defaultCatalog = {};
  const peerCatalog = {};
  let section = null;
  let nestedSection = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (line.startsWith('catalog:')) {
      section = 'catalog';
      nestedSection = null;
      continue;
    }

    if (line.startsWith('catalogs:')) {
      section = 'catalogs';
      nestedSection = null;
      continue;
    }

    if (section === 'catalogs' && line.startsWith('  ') && trimmed.endsWith(':')) {
      nestedSection = trimmed.slice(0, -1);
      continue;
    }

    const match = line.match(/^\s+("[^"]+"|[^:]+):\s+(.+)$/);
    if (!match) continue;

    const key = match[1].replace(/^"|"$/g, '').trim();
    const value = match[2].trim().replace(/^"|"$/g, '');

    if (section === 'catalog' && line.startsWith('  ')) {
      defaultCatalog[key] = value;
    }

    if (section === 'catalogs' && nestedSection === 'peer' && line.startsWith('    ')) {
      peerCatalog[key] = value;
    }
  }

  return { defaultCatalog, peerCatalog };
}

function resolveCatalogReference(name, version, catalogs) {
  if (version === 'catalog:') {
    return catalogs.defaultCatalog[name] ?? version;
  }

  if (version === 'catalog:peer') {
    return catalogs.peerCatalog[name] ?? version;
  }

  return version;
}

function resolveDependencyMap(dependencies, catalogs) {
  if (!dependencies) return undefined;

  const resolved = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      resolveCatalogReference(name, version, catalogs),
    ]),
  );

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

async function readPackageJson() {
  return JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
}

function buildPublishedManifest(pkg, catalogs) {
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
      './package.json': './package.json',
    },
    publishConfig: {
      access: 'public',
    },
    peerDependencies: resolveDependencyMap(pkg.peerDependencies, catalogs),
  };

  return Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => value !== undefined),
  );
}

async function copyIfExists(sourcePath, destPath) {
  if (!existsSync(sourcePath)) return;
  await fs.copyFile(sourcePath, destPath);
}

async function main() {
  const pkg = await readPackageJson();
  const catalogs = await loadWorkspaceCatalogs();
  const manifest = buildPublishedManifest(pkg, catalogs);

  await fs.writeFile(
    path.join(distDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  await copyIfExists(path.join(packageDir, 'README.md'), path.join(distDir, 'README.md'));
  await copyIfExists(path.join(repoRoot, 'LICENSE'), path.join(distDir, 'LICENSE'));
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
