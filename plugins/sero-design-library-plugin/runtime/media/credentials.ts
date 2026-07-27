import { chmod, rm, writeFile } from 'node:fs/promises';

import type { CredentialStatus } from '../../shared/media';
import type { DesignLibraryPaths } from '../../shared/paths';
import { secretsFile } from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';

/**
 * Where the provider key comes from (spec §8.3, D9).
 *
 * Environment first, a user-supplied key second. The resolved value stays in
 * this module and the adapter that calls it: it is never written into reactive
 * state, never projected into a summary and never returned from a tool. The UI
 * is told `env | stored | missing` and nothing else.
 *
 * A stored key sits at the same protection level as `auth.json` — there is no
 * encrypted store available to a plugin, since `getProviderApiKey` resolves
 * *model* providers only. That is a known and accepted limitation, which is why
 * the environment path is preferred and labelled as such in Settings.
 */

const ENV_VAR = 'FAL_KEY';

interface StoredSecrets {
  falKey?: string;
}

/**
 * A missing or unreadable file resolves to "no stored key" rather than throwing.
 *
 * The status is read whenever Settings opens, so a corrupt `secrets.json` that
 * threw here would take the Settings page down over a file the user can simply
 * re-enter — and it would do it in the one place that could fix it.
 */
async function readSecrets(paths: DesignLibraryPaths): Promise<StoredSecrets> {
  const parsed = await readJsonFile<unknown>(secretsFile(paths));
  if (typeof parsed !== 'object' || parsed === null) return {};
  const key = (parsed as Record<string, unknown>).falKey;
  return typeof key === 'string' && key !== '' ? { falKey: key } : {};
}

/**
 * The key to use, or undefined when there is none.
 *
 * Read on every call rather than cached, so a key added or removed in Settings
 * takes effect on the next generation instead of on the next restart.
 */
export async function resolveFalKey(
  paths: DesignLibraryPaths,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const fromEnv = env[ENV_VAR];
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv;
  return (await readSecrets(paths)).falKey;
}

/** What the UI is allowed to know: where the key came from, never what it is. */
export async function falKeyStatus(
  paths: DesignLibraryPaths,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CredentialStatus> {
  const fromEnv = env[ENV_VAR];
  if (typeof fromEnv === 'string' && fromEnv !== '') return 'env';
  return (await readSecrets(paths)).falKey === undefined ? 'missing' : 'stored';
}

/**
 * Store a key, owner-readable only.
 *
 * The mode is set after the write rather than passed to `writeFile`, because
 * `writeFile`'s mode applies only when it creates the file — overwriting an
 * existing key would silently keep whatever permissions it already had.
 */
export async function storeFalKey(paths: DesignLibraryPaths, key: string): Promise<void> {
  const file = secretsFile(paths);
  const secrets: StoredSecrets = { falKey: key };
  await writeFile(file, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function clearFalKey(paths: DesignLibraryPaths): Promise<void> {
  await rm(secretsFile(paths), { force: true });
}
