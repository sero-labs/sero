import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * electron-builder hook for platform-specific app bundle fixes.
 *
 * Linux packages include Electron's chrome-sandbox helper. Preserve the SUID
 * mode before building .deb packages so Chromium can use it after install.
 * dpkg-deb writes package payloads as root-owned files; the maintainer script
 * also reapplies root:root + 4755 after installation.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const sandboxPath = path.join(context.appOutDir, 'chrome-sandbox');
  if (!existsSync(sandboxPath)) return;

  chmodSync(sandboxPath, 0o4755);
}
