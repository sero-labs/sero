/**
 * Locating the packaged build.
 *
 * The packaged specs run the artifact `pnpm --filter @sero/desktop pack`
 * produces, not the development tree, so they need its executable path and a
 * shared reason to skip when no build exists.
 */

import fs from 'node:fs';
import path from 'node:path';

const DESKTOP_ROOT = path.resolve(__dirname, '../..');
const RELEASE_DIR = path.join(DESKTOP_ROOT, 'release');

/** The executable an unpacked build leaves behind, by platform. */
function packagedCandidates(): string[] {
  return [
    path.join(RELEASE_DIR, 'mac-arm64', 'Sero.app', 'Contents', 'MacOS', 'Sero'),
    path.join(RELEASE_DIR, 'mac', 'Sero.app', 'Contents', 'MacOS', 'Sero'),
    path.join(RELEASE_DIR, 'linux-unpacked', 'sero'),
    path.join(RELEASE_DIR, 'win-unpacked', 'Sero.exe'),
  ];
}

/** The packaged app to run: `SERO_E2E_PACKAGED_APP` if set, else the latest build. */
export function findPackagedApp(): string | null {
  const override = process.env.SERO_E2E_PACKAGED_APP;
  if (override) return fs.existsSync(override) ? override : null;
  return packagedCandidates().find((candidate) => fs.existsSync(candidate)) ?? null;
}

export const PACKAGED_SKIP_REASON =
  'No packaged app found. Run `pnpm --filter @sero/desktop pack`, or set SERO_E2E_PACKAGED_APP.';
