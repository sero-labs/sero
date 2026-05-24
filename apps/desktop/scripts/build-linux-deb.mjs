import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function currentDebArch() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'x64') return 'amd64';
  throw new Error(`Unsupported Debian architecture for ${process.arch}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function buildControl(arch) {
  return [
    'Package: sero',
    `Version: ${pkg.version}`,
    'Section: devel',
    'Priority: optional',
    `Architecture: ${arch}`,
    `Maintainer: ${pkg.author?.name ?? 'Sero Labs'} <${pkg.author?.email ?? 'hello@sero.ai'}>`,
    'Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0',
    `Homepage: ${pkg.homepage ?? 'https://sero.ai'}`,
    `Description: ${pkg.description ?? 'Sero desktop app'}`,
    ' Agent-first workspace for local development.',
    '',
  ].join('\n');
}

function buildDesktopEntry() {
  return [
    '[Desktop Entry]',
    'Name=Sero',
    `Comment=${pkg.description ?? 'Sero desktop app'}`,
    'Exec=/opt/Sero/@serodesktop %U',
    'Terminal=false',
    'Type=Application',
    'Categories=Development;',
    'StartupWMClass=Sero',
    '',
  ].join('\n');
}

const debArch = currentDebArch();
const appOutDir = path.join(releaseDir, `linux-${process.arch}-unpacked`);
const executablePath = path.join(appOutDir, '@serodesktop');
if (!fs.existsSync(executablePath)) {
  throw new Error(`Unpacked Linux app not found at ${appOutDir}. Run electron-builder --linux --${process.arch} --dir first.`);
}

const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-deb-'));
const appDest = path.join(stageDir, 'opt/Sero');
const debianDir = path.join(stageDir, 'DEBIAN');

fs.mkdirSync(appDest, { recursive: true });
fs.cpSync(appOutDir, appDest, { recursive: true, dereference: true });

const sandboxPath = path.join(appDest, 'chrome-sandbox');
if (fs.existsSync(sandboxPath)) {
  fs.chmodSync(sandboxPath, 0o4755);
}

fs.mkdirSync(debianDir, { recursive: true });
fs.writeFileSync(path.join(debianDir, 'control'), buildControl(debArch));
writeExecutable(path.join(debianDir, 'postinst'), [
  '#!/bin/sh',
  'set -e',
  'if [ -f /opt/Sero/chrome-sandbox ]; then',
  '  chown root:root /opt/Sero/chrome-sandbox || true',
  '  chmod 4755 /opt/Sero/chrome-sandbox || true',
  'fi',
  'command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true',
  'exit 0',
  '',
].join('\n'));
writeExecutable(path.join(debianDir, 'postrm'), [
  '#!/bin/sh',
  'set -e',
  'command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true',
  'exit 0',
  '',
].join('\n'));

const applicationsDir = path.join(stageDir, 'usr/share/applications');
fs.mkdirSync(applicationsDir, { recursive: true });
fs.writeFileSync(path.join(applicationsDir, 'sero.desktop'), buildDesktopEntry());

const artifact = path.join(releaseDir, `Sero-${pkg.version}-${debArch}.deb`);
fs.rmSync(artifact, { force: true });
run('dpkg-deb', ['--root-owner-group', '--build', stageDir, artifact]);
fs.rmSync(stageDir, { recursive: true, force: true });
console.log(`Built ${artifact}`);
