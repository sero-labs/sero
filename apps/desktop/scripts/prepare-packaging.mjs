import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const electronMainPath = path.join(projectRoot, 'dist/electron/main.mjs');
const rendererIndexPath = path.join(projectRoot, 'dist/renderer/index.html');
const webDistSource = path.join(projectRoot, 'electron/features/gateway/web-dist');
const webDistDest = path.join(projectRoot, 'dist/electron/web-dist');
const webRemotePackageJson = path.resolve(projectRoot, '../web-remote/package.json');
const workspaceNodeModules = [
  { packageName: '@sero-ai/app-runtime', source: path.resolve(projectRoot, '../../packages/app-runtime') },
  { packageName: '@sero-ai/common', source: path.resolve(projectRoot, '../../packages/common') },
  { packageName: '@sero-ai/ui', source: path.resolve(projectRoot, '../../packages/ui') },
];

function ensureBuildOutputExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found at ${filePath}. Run pnpm build first.`);
  }
}

function packageNodeModulePath(packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
}

function materializeWorkspaceNodeModules() {
  // electron-builder cannot pack pnpm workspace symlinks that resolve outside
  // apps/desktop, so copy the runtime @sero-ai packages into place first.
  for (const { packageName, source } of workspaceNodeModules) {
    if (!fs.existsSync(source)) continue;
    const dest = packageNodeModulePath(packageName);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(source, dest, {
      recursive: true,
      dereference: true,
      filter: (entry) => !['.turbo', 'node_modules'].includes(path.basename(entry)),
    });
  }
  console.log('  Materialized workspace @sero-ai packages for packaging');
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
