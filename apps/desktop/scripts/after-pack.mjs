import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * electron-builder hook for platform-specific app bundle fixes.
 *
 * macOS unsigned beta builds are ad-hoc signed so the downloaded app has a
 * valid bundle seal. This does not notarize the app or bypass Gatekeeper; it
 * only prevents malformed-signature "damaged app" failures.
 *
 * Linux packages include Electron's chrome-sandbox helper. Preserve the SUID
 * mode before building .deb packages so Chromium can use it after install.
 * dpkg-deb writes package payloads as root-owned files; the maintainer script
 * also reapplies root:root + 4755 after installation.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    signMacBundleAdHoc(context);
    return;
  }

  if (context.electronPlatformName !== 'linux') return;

  const sandboxPath = path.join(context.appOutDir, 'chrome-sandbox');
  if (!existsSync(sandboxPath)) return;

  chmodSync(sandboxPath, 0o4755);
}

function signMacBundleAdHoc(context) {
  if (process.env.SERO_MAC_ADHOC_SIGN === '0') return;
  // Only ad-hoc sign unsigned builds. CSC_IDENTITY_AUTO_DISCOVERY=false means electron-builder
  // skips its own signing, so this hook is the bundle's only seal. Signed builds (CSC_LINK set)
  // leave the var unset and get real Developer ID signing + hardened runtime from electron-builder.
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!existsSync(appPath)) return;

  // Ad-hoc, non-hardened seal: hardenedRuntime in electron-builder.yml only applies to the signed
  // path, so an ad-hoc beta is intentionally not hardened. --deep re-seals the rebuilt native
  // modules; it is a deliberate ad-hoc-only shortcut and must not be reused for notarized builds.
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    path.join(context.packager.projectDir, 'build/entitlements.mac.plist'),
    '--timestamp=none',
    appPath,
  ], { stdio: 'inherit' });
}
