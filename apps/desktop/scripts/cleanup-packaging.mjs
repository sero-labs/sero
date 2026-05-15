import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const statePath = path.join(projectRoot, '.sero-packaging-state.json');

function packageNodeModulePath(packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
}

function restoreEntry(entry) {
  const dest = packageNodeModulePath(entry.packageName);
  fs.rmSync(dest, { recursive: true, force: true });

  if (entry.type === 'symlink') {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(entry.target, dest);
    return;
  }

  if (entry.type === 'directory') {
    if (!entry.backupPath || !fs.existsSync(entry.backupPath)) {
      console.warn(`  Could not restore ${entry.packageName}: backup missing`);
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(entry.backupPath, dest);
  }
}

if (!fs.existsSync(statePath)) {
  process.exit(0);
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const entries = Array.isArray(state.entries) ? state.entries : [];

for (const entry of entries.reverse()) {
  restoreEntry(entry);
}

fs.rmSync(statePath, { force: true });
console.log('  Restored workspace @sero-ai package links after packaging');
