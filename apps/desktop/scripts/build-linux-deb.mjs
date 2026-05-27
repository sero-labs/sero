import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');

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

function buildControl(pkg, arch) {
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

function buildDesktopEntry(pkg) {
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

function linuxUnpackedDir() {
  const candidates = [
    path.join(releaseDir, `linux-${process.arch}-unpacked`),
    path.join(releaseDir, 'linux-unpacked'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, '@serodesktop')));
  if (!found) {
    throw new Error(
      `Unpacked Linux app not found. Checked: ${candidates.join(', ')}. ` +
      `Run electron-builder --linux --${process.arch} --dir first.`,
    );
  }
  return found;
}

/**
 * electron-updater derives the channel from the semver prerelease tag, matching
 * electron-builder's `appInfo.channel` (semver `prerelease(version)[0]`). So
 * `0.1.2-beta.0` → `beta` and `1.0.0` → `latest`. The generated feed file must
 * use the same channel as the embedded `resources/app-update.yml` (which
 * electron-builder writes during the --dir afterPack stage) and the mac/win
 * feed files, or electron-updater requests a channel file that does not exist.
 */
export function channelFromVersion(version) {
  const core = String(version).split('+')[0];
  const dashIndex = core.indexOf('-');
  if (dashIndex === -1) return 'latest';
  const prerelease = core.slice(dashIndex + 1);
  const first = prerelease.split('.')[0];
  return first || 'latest';
}

/**
 * Mirrors electron-updater's `Provider.getChannelFilePrefix` for Linux:
 * `${channel}-linux.yml` for x64 and `${channel}-linux-${arch}.yml` otherwise.
 */
export function updateInfoFileName(channel, arch) {
  const archSuffix = arch === 'x64' ? '' : `-${arch}`;
  return `${channel}-linux${archSuffix}.yml`;
}

/** Build the electron-updater feed (UpdateInfo) YAML for a single .deb artifact. */
export function buildFeedYaml({ version, artifactName, sha512, size, releaseDate }) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${artifactName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${artifactName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n');
}

function sha512Base64(filePath) {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const debArch = currentDebArch();
  const appOutDir = linuxUnpackedDir();

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-deb-'));
  const appDest = path.join(stageDir, 'opt/Sero');
  const debianDir = path.join(stageDir, 'DEBIAN');

  fs.mkdirSync(appDest, { recursive: true });
  fs.cpSync(appOutDir, appDest, { recursive: true, dereference: true });

  const sandboxPath = path.join(appDest, 'chrome-sandbox');
  if (fs.existsSync(sandboxPath)) {
    fs.chmodSync(sandboxPath, 0o4755);
  }

  // Self-identifying marker so electron-updater selects DebUpdater (not the
  // AppImage fallback). electron-builder normally writes this for its own deb
  // target; we build the .deb with dpkg-deb, so we add it here. It sits beside
  // the app-update.yml electron-builder wrote during the --dir afterPack stage.
  const resourcesDir = path.join(appDest, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, 'package-type'), 'deb');

  fs.mkdirSync(debianDir, { recursive: true });
  fs.writeFileSync(path.join(debianDir, 'control'), buildControl(pkg, debArch));
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
  fs.writeFileSync(path.join(applicationsDir, 'sero.desktop'), buildDesktopEntry(pkg));

  const artifactName = `Sero-${pkg.version}-linux-${process.arch}.deb`;
  const artifact = path.join(releaseDir, artifactName);
  fs.rmSync(artifact, { force: true });
  run('dpkg-deb', ['--root-owner-group', '--build', stageDir, artifact]);
  fs.rmSync(stageDir, { recursive: true, force: true });
  console.log(`Built ${artifact}`);

  // Emit the electron-updater feed metadata for this Debian artifact. The
  // manual dpkg-deb path bypasses electron-builder's distributable target, so
  // the latest/beta-linux*.yml is not produced for us — write it explicitly.
  const channel = channelFromVersion(pkg.version);
  const feedName = updateInfoFileName(channel, process.arch);
  const feed = buildFeedYaml({
    version: pkg.version,
    artifactName,
    sha512: sha512Base64(artifact),
    size: fs.statSync(artifact).size,
    releaseDate: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(releaseDir, feedName), feed);
  console.log(`Wrote ${path.join(releaseDir, feedName)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
