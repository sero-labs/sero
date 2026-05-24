import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromScript = createRequire(import.meta.url);
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

function readPackagingState() {
  if (!fs.existsSync(statePath)) return { entries: [], generatedPaths: [] };
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  return {
    entries: Array.isArray(state.entries) ? state.entries : [],
    generatedPaths: Array.isArray(state.generatedPaths) ? state.generatedPaths : [],
  };
}

function writePackagingState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

function materializeWorkspaceNodeModules() {
  // Recover from an interrupted previous packaging run before taking a new
  // snapshot. The cleanup script restores pnpm workspace symlinks if needed.
  if (fs.existsSync(statePath)) {
    console.warn('  Found previous packaging state; restoring before preparing again');
    runCleanup();
  }

  const packages = getWorkspaceNodeModules();
  const state = { entries: [], generatedPaths: [] };

  // electron-builder cannot pack pnpm workspace symlinks that resolve outside
  // apps/desktop, so copy workspace @sero-ai packages into place temporarily.
  for (const { packageName, source } of packages) {
    const dest = packageNodeModulePath(packageName);
    state.entries.push(snapshotExistingPackage(packageName));
    writePackagingState(state);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(source, dest, {
      recursive: true,
      dereference: true,
      filter: (entry) => !['.turbo', 'node_modules'].includes(path.basename(entry)),
    });
  }

  writePackagingState(state);
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

function resolvePackageJson(packageName, fromPath = projectRoot) {
  return requireFromScript.resolve(`${packageName}/package.json`, { paths: [fromPath] });
}

function materializePackage(packageName, fromPath = projectRoot) {
  const sourcePackageJson = resolvePackageJson(packageName, fromPath);
  const source = path.dirname(sourcePackageJson);
  const dest = packageNodeModulePath(packageName);
  const state = readPackagingState();

  state.entries.push(snapshotExistingPackage(packageName));
  writePackagingState(state);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(source, dest, { recursive: true, dereference: true });
  return source;
}

function verifyCliHighlightRuntimeResolution() {
  const requireFromDesktop = createRequire(path.join(projectRoot, 'package.json'));
  const theme = requireFromDesktop('cli-highlight/dist/theme');
  if (typeof theme.DEFAULT_THEME?.type !== 'function') {
    throw new Error('cli-highlight runtime theme failed to resolve chalk styles');
  }
}

function materializeCliHighlightChalkDeps() {
  materializePackage('cli-highlight');
  materializePackage('chalk');
  const ansiStylesSource = materializePackage('ansi-styles');
  const supportsColorSource = materializePackage('supports-color');
  const colorConvertSource = materializePackage('color-convert', ansiStylesSource);
  materializePackage('color-name', colorConvertSource);
  materializePackage('has-flag', supportsColorSource);

  const chalkPackageJson = packageNodeModulePath('chalk/package.json');
  const chalkPackage = JSON.parse(fs.readFileSync(chalkPackageJson, 'utf8'));
  if (!String(chalkPackage.version).startsWith('4.')) {
    throw new Error(`cli-highlight must package chalk 4.x, found ${chalkPackage.version}`);
  }

  verifyCliHighlightRuntimeResolution();
  console.log('  Materialized cli-highlight chalk dependencies for packaging');
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
materializeCliHighlightChalkDeps();
materializeWebDistForPackaging();
