#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const workspaceYamlPath = path.join(repoRoot, 'pnpm-workspace.yaml');
const extensionTsconfigBasePath = path.join(repoRoot, 'packages', 'tsconfig.extension.json');

const packageArg = process.argv[2];
if (!packageArg) {
  console.error('Usage: node scripts/export-plugin-source.mjs <package-dir>');
  process.exit(1);
}

const packageDir = path.resolve(process.cwd(), packageArg);
const packageJsonPath = path.join(packageDir, 'package.json');
const PREFERRED_PUBLISHED_WORKSPACE_PACKAGES = new Map([
  ['@sero/app-runtime', '@sero-ai/app-runtime'],
]);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeVendorDirName(packageName) {
  return packageName.replace(/^@/, '').replace(/[\/]/g, '-');
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

function toFileSpec(fromRelativeDir, toRelativeDir) {
  const fromDir = path.join(outputDir, fromRelativeDir);
  const targetDir = path.join(outputDir, toRelativeDir);
  let relativePath = toPosix(path.relative(fromDir, targetDir));
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return `file:${relativePath}`;
}

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readPackageJson(dir) {
  if (!existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`No package.json found in ${dir}`);
  }
  return readJson(path.join(dir, 'package.json'));
}

async function loadWorkspacePackageMap() {
  const packageMap = new Map();
  const roots = [path.join(repoRoot, 'packages'), path.join(repoRoot, 'apps')];

  for (const root of roots) {
    if (!existsSync(root)) continue;
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const pkgPath = path.join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = await readJson(pkgPath);
      if (typeof pkg.name === 'string') {
        packageMap.set(pkg.name, dir);
      }
    }
  }

  return packageMap;
}

async function copyDirFiltered(sourceDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', '.turbo'].includes(entry.name)) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirFiltered(sourcePath, destPath);
    } else {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

function parseWorkspaceDependency(dependencyName, version) {
  if (typeof version !== 'string' || !version.startsWith('workspace:')) {
    return null;
  }

  const workspaceRef = version.slice('workspace:'.length);
  if (!workspaceRef || ['*', '^', '~'].includes(workspaceRef)) {
    return {
      dependencyName,
      workspacePackageName: dependencyName,
    };
  }

  const versionSeparatorIndex = workspaceRef.lastIndexOf('@');
  if (workspaceRef.startsWith('@') && versionSeparatorIndex > 0) {
    return {
      dependencyName,
      workspacePackageName: workspaceRef.slice(0, versionSeparatorIndex),
    };
  }

  if (!workspaceRef.startsWith('@') && versionSeparatorIndex > 0) {
    return {
      dependencyName,
      workspacePackageName: workspaceRef.slice(0, versionSeparatorIndex),
    };
  }

  return {
    dependencyName,
    workspacePackageName: workspaceRef,
  };
}

function getWorkspaceDependencies(pkg) {
  const dependencies = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      const workspaceDependency = parseWorkspaceDependency(name, version);
      if (workspaceDependency) {
        dependencies.push(workspaceDependency);
      }
    }
  }
  return dependencies;
}

function getPackageEntryPath(pkg) {
  if (typeof pkg.exports === 'string') return pkg.exports;
  if (pkg.exports && typeof pkg.exports['.'] === 'string') return pkg.exports['.'];
  if (typeof pkg.types === 'string') return pkg.types;
  if (typeof pkg.main === 'string') return pkg.main;
  return './src/index.ts';
}

function getPreferredPublishedPackageName(dependencyName) {
  return PREFERRED_PUBLISHED_WORKSPACE_PACKAGES.get(dependencyName) ?? null;
}

function hasPublishedPackageVersion(packageName, version) {
  try {
    execFileSync('npm', ['view', `${packageName}@${version}`, 'version', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

const catalogs = await loadWorkspaceCatalogs();
const workspacePackages = await loadWorkspacePackageMap();
const outputDir = path.join(packageDir, 'dist', 'plugin-source');
const publishedWorkspacePackages = new Map();
const vendoredPackages = new Map();

async function ensureWorkspaceDependencyPrepared(workspaceDependency) {
  if (
    publishedWorkspacePackages.has(workspaceDependency.dependencyName) ||
    vendoredPackages.has(workspaceDependency.dependencyName)
  ) {
    return;
  }

  const sourceDir = workspacePackages.get(workspaceDependency.workspacePackageName);
  if (!sourceDir) {
    throw new Error(
      `Workspace package ${workspaceDependency.workspacePackageName} not found for source export`,
    );
  }

  const pkg = await readPackageJson(sourceDir);
  const publishedPackageName = getPreferredPublishedPackageName(
    workspaceDependency.dependencyName,
  );

  if (publishedPackageName && hasPublishedPackageVersion(publishedPackageName, pkg.version)) {
    publishedWorkspacePackages.set(workspaceDependency.dependencyName, {
      packageName: publishedPackageName,
      version: pkg.version,
    });
    return;
  }

  await ensureVendoredWorkspacePackage(workspaceDependency);
}

function toPublishedDependencySpec(dependencyName, publishedPackage) {
  return dependencyName === publishedPackage.packageName
    ? publishedPackage.version
    : `npm:${publishedPackage.packageName}@${publishedPackage.version}`;
}

function rewriteDependencyMap(dependencies, currentRelativeDir) {
  if (!dependencies) return undefined;

  const rewritten = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => {
      const workspaceDependency = parseWorkspaceDependency(name, version);
      if (workspaceDependency) {
        const publishedPackage = publishedWorkspacePackages.get(workspaceDependency.dependencyName);
        if (publishedPackage) {
          return [
            workspaceDependency.dependencyName,
            toPublishedDependencySpec(workspaceDependency.dependencyName, publishedPackage),
          ];
        }

        const vendored = vendoredPackages.get(workspaceDependency.dependencyName);
        if (!vendored) {
          throw new Error(
            `Workspace dependency ${workspaceDependency.dependencyName} was not prepared before manifest rewrite`,
          );
        }
        return [workspaceDependency.dependencyName, toFileSpec(currentRelativeDir, vendored.relativeDir)];
      }

      return [name, resolveCatalogReference(name, version, catalogs)];
    }),
  );

  return Object.keys(rewritten).length > 0 ? rewritten : undefined;
}

function buildExportedManifest(pkg, currentRelativeDir) {
  const manifest = {
    ...pkg,
    private: undefined,
    packageManager: undefined,
    dependencies: rewriteDependencyMap(pkg.dependencies, currentRelativeDir),
    devDependencies: rewriteDependencyMap(pkg.devDependencies, currentRelativeDir),
    peerDependencies: rewriteDependencyMap(pkg.peerDependencies, currentRelativeDir),
    optionalDependencies: rewriteDependencyMap(pkg.optionalDependencies, currentRelativeDir),
    sero: pkg.sero
      ? {
          ...pkg.sero,
          ...(pkg.sero.plugin
            ? {
                plugin: {
                  ...pkg.sero.plugin,
                  preBuilt: false,
                },
              }
            : {}),
        }
      : undefined,
  };

  return Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => value !== undefined),
  );
}

async function ensureVendoredWorkspacePackage(workspaceDependency) {
  if (vendoredPackages.has(workspaceDependency.dependencyName)) {
    return vendoredPackages.get(workspaceDependency.dependencyName);
  }

  const sourceDir = workspacePackages.get(workspaceDependency.workspacePackageName);
  if (!sourceDir) {
    throw new Error(
      `Workspace package ${workspaceDependency.workspacePackageName} not found for source export`,
    );
  }

  const pkg = await readPackageJson(sourceDir);
  const relativeDir = path.posix.join(
    'vendor',
    normalizeVendorDirName(workspaceDependency.dependencyName),
  );
  const vendored = {
    sourceDir,
    relativeDir,
    entryPath: getPackageEntryPath(pkg).replace(/^\.\//, ''),
    dependencyName: workspaceDependency.dependencyName,
  };

  vendoredPackages.set(workspaceDependency.dependencyName, vendored);
  await exportPackageSource(sourceDir, relativeDir);

  if (workspaceDependency.dependencyName !== pkg.name) {
    const vendoredPackageJsonPath = path.join(outputDir, relativeDir, 'package.json');
    const vendoredPkg = await readJson(vendoredPackageJsonPath);
    vendoredPkg.name = workspaceDependency.dependencyName;
    await fs.writeFile(vendoredPackageJsonPath, `${JSON.stringify(vendoredPkg, null, 2)}\n`, 'utf8');
  }

  return vendored;
}

async function exportPackageSource(sourceDir, relativeDir = '.') {
  const pkg = await readPackageJson(sourceDir);
  for (const workspaceDependency of getWorkspaceDependencies(pkg)) {
    await ensureWorkspaceDependencyPrepared(workspaceDependency);
  }

  const destDir = relativeDir === '.' ? outputDir : path.join(outputDir, relativeDir);
  await copyDirFiltered(sourceDir, destDir);

  const manifest = buildExportedManifest(pkg, relativeDir);
  await fs.writeFile(
    path.join(destDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function rewriteRootTypeScriptConfigs() {
  const extensionTsconfigPath = path.join(outputDir, 'extension', 'tsconfig.json');
  if (existsSync(extensionTsconfigPath) && existsSync(extensionTsconfigBasePath)) {
    await fs.copyFile(extensionTsconfigBasePath, path.join(outputDir, 'tsconfig.extension.json'));
    const extensionTsconfig = await readJson(extensionTsconfigPath);
    extensionTsconfig.extends = '../tsconfig.extension.json';
    await fs.writeFile(
      extensionTsconfigPath,
      `${JSON.stringify(extensionTsconfig, null, 2)}\n`,
      'utf8',
    );
  }

  const uiTsconfigPath = path.join(outputDir, 'ui', 'tsconfig.json');
  if (!existsSync(uiTsconfigPath)) {
    return;
  }

  const uiTsconfig = await readJson(uiTsconfigPath);
  const compilerOptions = uiTsconfig.compilerOptions ?? {};
  const paths = { ...(compilerOptions.paths ?? {}) };

  for (const packageName of publishedWorkspacePackages.keys()) {
    delete paths[packageName];
  }

  for (const [packageName, vendored] of vendoredPackages.entries()) {
    const targetPath = toPosix(path.relative(
      path.join(outputDir, 'ui'),
      path.join(outputDir, vendored.relativeDir, vendored.entryPath),
    ));
    paths[packageName] = [targetPath];
  }

  uiTsconfig.compilerOptions = {
    ...compilerOptions,
    paths: undefined,
    ...(Object.keys(paths).length > 0 ? { paths } : {}),
  };

  await fs.writeFile(uiTsconfigPath, `${JSON.stringify(uiTsconfig, null, 2)}\n`, 'utf8');
}

async function main() {
  const rootPkg = await readPackageJson(packageDir);
  const appId = rootPkg.sero?.app?.id;
  if (!appId) {
    throw new Error(`No sero.app.id found in ${packageJsonPath}`);
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`📦 Exporting plugin source: ${appId} (${packageDir})`);
  await exportPackageSource(packageDir);
  await rewriteRootTypeScriptConfigs();

  console.log(`✅ Plugin source exported successfully`);
  console.log(`   Output: ${path.relative(process.cwd(), outputDir)}`);
  console.log('');
  console.log('To publish the source repo contents:');
  console.log(`   rsync -a --delete '${outputDir}/' <git-repo-working-copy>/`);
  console.log('');
  console.log('To smoke test the exported source repo:');
  console.log(`   (cd '${outputDir}' && npm install && npm run build)`);
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
