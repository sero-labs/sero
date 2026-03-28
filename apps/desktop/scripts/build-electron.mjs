import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const monorepoPackagesDir = path.resolve(projectRoot, '../../packages');
const monorepoPluginsDir = path.resolve(projectRoot, '../../plugins');

const shared = {
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  external: ['electron', 'node-pty', '@mariozechner/*', '@sinclair/typebox', '@google/genai', 'ws', 'discord.js'],
  outdir: 'dist/electron',
  logLevel: 'info',
  // Keep import.meta.url working for ESM dependencies (pi SDK)
  banner: {
    js: `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirnameFn } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFn(__filename);
`.trim(),
  },
};

// Keep in sync with the TS copy in electron/builtin-resources.ts.
function isBuiltinPackageDir(pkgPath) {
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return (
      pkg.pi?.extensions != null ||
      pkg.piExtension != null ||
      pkg.sero?.app != null ||
      fs.existsSync(path.join(pkgPath, 'extension'))
    );
  } catch {
    return false;
  }
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function stageBuiltinResources() {
  const builtinRoot = path.join(projectRoot, 'dist/electron/builtin');
  const builtinPackagesDest = path.join(builtinRoot, 'packages');
  const builtinPluginsDest = path.join(builtinRoot, 'plugins');
  const builtinTemplatesDest = path.join(builtinRoot, 'templates');
  fs.rmSync(builtinRoot, { recursive: true, force: true });
  fs.mkdirSync(builtinPackagesDest, { recursive: true });
  fs.mkdirSync(builtinPluginsDest, { recursive: true });

  const packageEntries = fs.existsSync(monorepoPackagesDir)
    ? fs.readdirSync(monorepoPackagesDir)
    : [];
  const pluginEntries = fs.existsSync(monorepoPluginsDir)
    ? fs.readdirSync(monorepoPluginsDir)
    : [];

  for (const entry of packageEntries) {
    if (!entry.startsWith('pi-')) continue;
    const srcDir = path.join(monorepoPackagesDir, entry);
    if (!isBuiltinPackageDir(srcDir)) continue;

    const destDir = path.join(builtinPackagesDest, entry);
    fs.mkdirSync(destDir, { recursive: true });

    copyIfExists(path.join(srcDir, 'package.json'), path.join(destDir, 'package.json'));
    copyIfExists(path.join(srcDir, 'README.md'), path.join(destDir, 'README.md'));
    copyIfExists(path.join(srcDir, 'dist'), path.join(destDir, 'dist'));
    copyIfExists(path.join(srcDir, 'extension'), path.join(destDir, 'extension'));
    copyIfExists(path.join(srcDir, 'shared'), path.join(destDir, 'shared'));
    copyIfExists(path.join(srcDir, 'skills'), path.join(destDir, 'skills'));
    copyIfExists(path.join(srcDir, 'prompts'), path.join(destDir, 'prompts'));
    copyIfExists(path.join(srcDir, 'themes'), path.join(destDir, 'themes'));
  }

  for (const entry of pluginEntries) {
    if (!entry.startsWith('sero-') || !entry.endsWith('-plugin')) continue;
    const srcDir = path.join(monorepoPluginsDir, entry);
    if (!isBuiltinPackageDir(srcDir)) continue;

    const destDir = path.join(builtinPluginsDest, entry);
    fs.mkdirSync(destDir, { recursive: true });

    copyIfExists(path.join(srcDir, 'package.json'), path.join(destDir, 'package.json'));
    copyIfExists(path.join(srcDir, 'README.md'), path.join(destDir, 'README.md'));
    copyIfExists(path.join(srcDir, 'dist'), path.join(destDir, 'dist'));
    copyIfExists(path.join(srcDir, 'extension'), path.join(destDir, 'extension'));
    copyIfExists(path.join(srcDir, 'shared'), path.join(destDir, 'shared'));
    copyIfExists(path.join(srcDir, 'skills'), path.join(destDir, 'skills'));
    copyIfExists(path.join(srcDir, 'prompts'), path.join(destDir, 'prompts'));
    copyIfExists(path.join(srcDir, 'themes'), path.join(destDir, 'themes'));
  }

  const templatesSrc = path.join(monorepoPackagesDir, 'templates');
  if (fs.existsSync(templatesSrc)) {
    fs.cpSync(templatesSrc, builtinTemplatesDest, {
      recursive: true,
      filter: (src) => path.basename(src) !== '.DS_Store',
    });
  }
}

// Main process
await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outExtension: { '.js': '.mjs' },
});

// Copy non-JS assets that the main process reads at runtime
fs.copyFileSync(
  path.join(projectRoot, 'electron/features/container/support/browser-helper.py'),
  path.join(projectRoot, 'dist/electron/browser-helper.py'),
);

// Symlink web-remote SPA so the gateway can serve it at runtime.
// Using a symlink instead of a copy means rebuilding web-remote
// is immediately picked up without re-running build-electron.
const webDistSrc = path.join(projectRoot, 'electron/features/gateway/web-dist');
const webDistDest = path.join(projectRoot, 'dist/electron/web-dist');
if (fs.existsSync(webDistSrc)) {
  // Remove existing copy or broken symlink
  fs.rmSync(webDistDest, { recursive: true, force: true });
  fs.symlinkSync(webDistSrc, webDistDest, 'dir');
  console.log('  Symlinked dist/electron/web-dist/ → electron/features/gateway/web-dist/');
}

// Copy built-in packages/templates into dist/electron/builtin/ so packaged
// builds can discover them without depending on the monorepo layout.
stageBuiltinResources();

// Preload — must be CJS for Electron's preload context
await build({
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  sourcemap: true,
  external: ['electron'],
  outdir: 'dist/electron',
  logLevel: 'info',
  entryPoints: ['electron/preload.ts'],
});
