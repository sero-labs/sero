/**
 * Sero plugin folder validation.
 *
 * Linked plugins surface external plugin source trees inside the explorer
 * for in-place development. We require a `package.json` with a populated
 * `sero.app.id` + `sero.app.name` field — the same shape the plugin
 * installer enforces — so users can't accidentally tag arbitrary folders
 * as `linked-plugin` and bypass the design contract.
 *
 * Lives in its own module (free of Electron imports) so the workspace IPC
 * layer can call it from the main process AND it can be unit-tested
 * without spinning up a fake `electron` module.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Throw if `folderPath` is not a Sero plugin source directory.
 *
 * Validates in the main process — not just the renderer — so the IPC API
 * itself rejects bogus payloads regardless of how they were constructed.
 */
export async function assertIsSeroPluginFolder(folderPath: string): Promise<void> {
  const pkgPath = path.join(folderPath, 'package.json');
  let raw: string;
  try {
    raw = await fs.readFile(pkgPath, 'utf8');
  } catch {
    throw new Error(
      `Not a Sero plugin: package.json not found in ${folderPath}`,
    );
  }

  let pkg: { sero?: { app?: { id?: unknown; name?: unknown } } };
  try {
    pkg = JSON.parse(raw);
  } catch {
    throw new Error(`Not a Sero plugin: package.json is not valid JSON`);
  }

  const app = pkg?.sero?.app;
  if (
    !app ||
    typeof app.id !== 'string' ||
    typeof app.name !== 'string' ||
    !app.id ||
    !app.name
  ) {
    throw new Error(
      `Not a Sero plugin: package.json must contain sero.app.id and sero.app.name`,
    );
  }
}
