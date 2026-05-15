import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const monoRoot = path.resolve(projectRoot, '../..');

const electronMainPath = path.join(projectRoot, 'dist/electron/main.mjs');
const rendererIndexPath = path.join(projectRoot, 'dist/renderer/index.html');
const webDistSource = path.join(projectRoot, 'electron/features/gateway/web-dist');
const webDistDest = path.join(projectRoot, 'dist/electron/web-dist');
const webRemotePackageJson = path.resolve(projectRoot, '../web-remote/package.json');
const desktopPackageJson = path.join(projectRoot, 'package.json');
const statePath = path.join(projectRoot, '.sero-packaging-state.json');

function ensureBuildOutputExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found at ${filePath}. Run pnpm build first.`);
  }
}

function packageNodeModulePath(packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
}

function sourceForWorkspacePackage(packageName) {
  const [, unscopedName] = packageName.split('/');
  return path.join(monoRoot, 'packages', unscopedName ?? '');
}

function getWorkspaceNodeModules() {
  const pkg = JSON.parse(fs.readFileSync(desktopPackageJson, 'utf8'));
  const dependencyNames = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ];
  return [...new Set(dependencyNames)]
    .filter((packageName) => packageName.startsWith('@sero-ai/'))
    .map((packageName) => ({ packageName, source: sourceForWorkspacePackage(packageName) }))
    .filter(({ packageName, source }) => {
      const exists = fs.existsSync(source);
      if (!exists) console.warn(`  Skipping ${packageName}: workspace source not found at ${source}`);
      return exists;
    });
}

function snapshotExistingPackage(packageName) {
  const dest = packageNodeModulePath(packageName);
  if (!fs.existsSync(dest)) return { packageName, type: 'missing' };

  const stat = fs.lstatSync(dest);
  if (stat.isSymbolicLink()) {
    return { packageName, type: 'symlink', target: fs.readlinkSync(dest) };
  }

  const backupPath = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.sero-packaging-backup`,
  );
  fs.rmSync(backupPath, { recursive: true, force: true });
  fs.renameSync(dest, backupPath);
  return { packageName, type: 'directory', backupPath };
}

function writePackagingState(entries) {
  fs.writeFileSync(statePath, JSON.stringify({ entries }, null, 2) + '\n');
}

function materializeWorkspaceNodeModules() {
  // Recover from an interrupted previous packaging run before taking a new
  // snapshot. The cleanup script restores pnpm workspace symlinks if needed.
  if (fs.existsSync(statePath)) {
    console.warn('  Found previous packaging state; restoring before preparing again');
    runCleanup();
  }

  const packages = getWorkspaceNodeModules();
  const entries = [];

  // electron-builder cannot pack pnpm workspace symlinks that resolve outside
  // apps/desktop, so copy workspace @sero-ai packages into place temporarily.
  for (const { packageName, source } of packages) {
    const dest = packageNodeModulePath(packageName);
    entries.push(snapshotExistingPackage(packageName));
    writePackagingState(entries);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(source, dest, {
      recursive: true,
      dereference: true,
      filter: (entry) => !['.turbo', 'node_modules'].includes(path.basename(entry)),
    });
  }

  writePackagingState(entries);
  console.log('  Materialized workspace @sero-ai packages for packaging');
}

function runCleanup() {
  // Keep prepare-packaging self-healing while leaving cleanup-packaging as the
  // normal post-packaging path used by npm scripts and build-release.sh.
  const cleanupPath = path.join(__dirname, 'cleanup-packaging.mjs');
  const { status } = spawnSync(process.execPath, [cleanupPath], { stdio: 'inherit' });
  if (status !== 0) {
    throw new Error('Failed to restore previous packaging state');
  }
}

function materializeWebDistForPackaging() {
  const hasWebRemoteApp = fs.existsSync(webRemotePackageJson);
  if (!hasWebRemoteApp) {
    return;
  }

  if (!fs.existsSync(webDistSource)) {
    throw new Error(
      `web-remote build output not found at ${webDistSource}. ` +
      'Run pnpm build or pnpm --dir apps/web-remote build first.',
    );
  }

  fs.rmSync(webDistDest, { recursive: true, force: true });
  fs.cpSync(webDistSource, webDistDest, {
    recursive: true,
    dereference: true,
    filter: (entry) => path.basename(entry) !== '.DS_Store',
  });

  console.log('  Materialized dist/electron/web-dist/ for packaging');
}

ensureBuildOutputExists(electronMainPath, 'Electron bundle');
ensureBuildOutputExists(rendererIndexPath, 'Renderer bundle');
materializeWorkspaceNodeModules();
materializeWebDistForPackaging();
