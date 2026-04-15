import path from 'node:path';

import { readRegistrySync } from '@electron/features/profile/manager';
import { SERO_AGENT_DIR } from '@electron/platform/env';

import {
  GOG_DEFAULT_CLIENT,
  argsWithClient,
  deriveProfileScopedKeyringPassword,
  exportTokenForClient,
  findTokenCandidateEmails,
  gogExecWithPassword,
  parseEmailFromTokenData,
  pipeToGog,
} from './gog-keyring';

/**
 * Find the current profile's token without enumerating the whole keyring.
 *
 * `gog auth tokens list` and `gog auth status` fail if *any* sibling token in
 * the shared file keyring was written with a different password. Exporting a
 * specific email key is resilient, so we probe candidate emails directly.
 */
export async function findAccessibleEmail(
  password: string,
  clientName: string,
): Promise<string | null> {
  const candidates = findTokenCandidateEmails();
  for (const email of candidates) {
    const tokenData = await exportTokenForClient(email, password, clientName);
    if (!tokenData) continue;
    return parseEmailFromTokenData(tokenData) ?? email;
  }

  return findEmailFromStatus(password, clientName);
}

async function findEmailFromStatus(
  password: string,
  clientName: string,
): Promise<string | null> {
  const status = await gogExecWithPassword(
    argsWithClient(clientName, ['--json', 'auth', 'status']),
    password,
  );
  if (!status) return null;

  try {
    const parsed = JSON.parse(status) as { account?: { email?: string } };
    const email = parsed.account?.email;
    return typeof email === 'string' && email ? email : null;
  } catch {
    return null;
  }
}

/**
 * Migrate tokens written by the buggy profile-scoped-password implementation
 * into the stable-password + per-profile-client-bucket layout.
 *
 * First we try the active profile's old password. If that finds nothing and
 * exactly one token exists on disk, we also try the other registered profile
 * passwords — this recovers the "same Google account in two profiles" case
 * where the second sign-in overwrote the shared `token:default:<email>` file.
 */
export async function migrateFromBuggyKeyring(
  targetClient: string,
  ensureCredentials: () => Promise<void>,
): Promise<string | null> {
  const candidates = findTokenCandidateEmails();
  if (candidates.length === 0) return null;

  const currentScopedPassword = deriveProfileScopedKeyringPassword(SERO_AGENT_DIR);
  const activeProfileMigration = await tryMigrateFromPassword(
    candidates,
    currentScopedPassword,
    targetClient,
    ensureCredentials,
  );
  if (activeProfileMigration) return activeProfileMigration;

  if (candidates.length !== 1) {
    return null;
  }

  const registry = readRegistrySync();
  for (const profile of registry.profiles) {
    const profileAgentDir = path.join(profile.path, 'agent');
    if (path.resolve(profileAgentDir) === path.resolve(SERO_AGENT_DIR)) continue;

    const password = deriveProfileScopedKeyringPassword(profileAgentDir);
    if (password === currentScopedPassword) continue;

    const migratedEmail = await tryMigrateFromPassword(
      candidates,
      password,
      targetClient,
      ensureCredentials,
    );
    if (migratedEmail) return migratedEmail;
  }

  return null;
}

async function tryMigrateFromPassword(
  candidates: string[],
  sourcePassword: string,
  targetClient: string,
  ensureCredentials: () => Promise<void>,
): Promise<string | null> {
  for (const email of candidates) {
    const tokenData = await exportTokenForClient(email, sourcePassword, GOG_DEFAULT_CLIENT);
    if (!tokenData) continue;

    await ensureCredentials();
    const importResult = await pipeTokenToClient(targetClient, tokenData);
    if (!importResult.ok) {
      console.warn('[google-auth] Token migration import failed:', importResult.out);
      continue;
    }

    const migratedEmail = parseEmailFromTokenData(tokenData) ?? email;
    console.log(
      `[google-auth] Migrated token for ${migratedEmail} into client bucket ${targetClient}`,
    );
    return migratedEmail;
  }

  return null;
}

function pipeTokenToClient(
  targetClient: string,
  tokenData: string,
): Promise<{ ok: boolean; out: string }> {
  return pipeToGog(
    argsWithClient(targetClient, ['auth', 'tokens', 'import', '-']),
    tokenData,
  );
}
