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

function ensureBuildOutputExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found at ${filePath}. Run pnpm build first.`);
  }
}

// build:electron leaves dist/electron/web-dist as a symlink into the source tree
// for fast local iteration. Replace it with a real copy so the downstream
// `pnpm deploy` bundle and electron-builder package the SPA contents instead of
// a symlink that resolves outside the bundle.
//
// Workspace @sero-ai packages and the pi SDK's chalk@4 chain used to be
// hand-materialized here too; the hoisted `pnpm deploy` bundle now resolves both
// correctly, so that logic was removed (see scripts/build-release.sh).
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
materializeWebDistForPackaging();
