import type { App } from 'electron';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

interface WidevineConfig {
  cdmPath: string;
  cdmVersion: string;
  source: 'env' | 'chrome';
}

interface WidevineManifest {
  version?: string;
}

const CHROME_APP_PATHS = [
  '/Applications/Google Chrome.app',
  '/Applications/Google Chrome Canary.app',
  '/Applications/Chromium.app',
];

function compareVersionStrings(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function getChromeFrameworkName(appPath: string): string {
  const base = path.basename(appPath, '.app');
  return `${base} Framework.framework`;
}

function archSubdir(): 'mac_arm64' | 'mac_x64' {
  return process.arch === 'arm64' ? 'mac_arm64' : 'mac_x64';
}

function readManifestVersion(manifestPath: string): string | null {
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as WidevineManifest;
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function detectWidevineFromChrome(): WidevineConfig | null {
  const platformDir = archSubdir();

  for (const appPath of CHROME_APP_PATHS) {
    const versionsDir = path.join(
      appPath,
      'Contents',
      'Frameworks',
      getChromeFrameworkName(appPath),
      'Versions',
    );

    if (!existsSync(versionsDir)) continue;

    let versionDirs: string[] = [];
    try {
      versionDirs = readdirSync(versionsDir)
        .filter((entry) => /^\d+\.\d+\.\d+\.\d+$/.test(entry))
        .sort((a, b) => compareVersionStrings(b, a));
    } catch {
      continue;
    }

    for (const chromeVersion of versionDirs) {
      const widevineRoot = path.join(
        versionsDir,
        chromeVersion,
        'Libraries',
        'WidevineCdm',
      );
      const manifestPath = path.join(widevineRoot, 'manifest.json');
      const cdmPath = path.join(widevineRoot, '_platform_specific', platformDir, 'libwidevinecdm.dylib');

      if (!existsSync(manifestPath) || !existsSync(cdmPath)) {
        continue;
      }

      const cdmVersion = readManifestVersion(manifestPath);
      if (!cdmVersion) {
        continue;
      }

      return {
        cdmPath,
        cdmVersion,
        source: 'chrome',
      };
    }
  }

  return null;
}

function getWidevineFromEnv(): WidevineConfig | null {
  const cdmPath = process.env.SERO_WIDEVINE_CDM_PATH?.trim();
  const cdmVersion = process.env.SERO_WIDEVINE_CDM_VERSION?.trim();

  if (!cdmPath || !cdmVersion) {
    return null;
  }

  return {
    cdmPath,
    cdmVersion,
    source: 'env',
  };
}

export function configureWidevine(app: App): void {
  const config = getWidevineFromEnv() ?? detectWidevineFromChrome();
  if (!config) {
    console.warn('[sero] Widevine CDM not found (Spotify Web Playback SDK DRM audio will not work)');
    return;
  }

  app.commandLine.appendSwitch('widevine-cdm-path', config.cdmPath);
  app.commandLine.appendSwitch('widevine-cdm-version', config.cdmVersion);

  console.log(
    `[sero] Widevine CDM configured from ${config.source}: ${config.cdmVersion} @ ${config.cdmPath}`,
  );
}
