/**
 * Per-profile secret lookup for non-model providers.
 *
 * Sero already stores provider credentials in `<SERO_HOME>/agent/auth.json`.
 * Reading that store keeps generated-asset credentials in the mechanism the
 * user already manages and needs no new host seam — the runtime host's
 * `credentials` API only knows model providers.
 */

import path from 'node:path';
import { readJsonFile } from '../shared/state-io';
import { resolveSeroHome } from '../shared/paths';

const ENV_VARS: Record<string, string> = {
  fal: 'FAL_KEY',
};

function extractKey(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const field of ['key', 'apiKey', 'token', 'access']) {
      const candidate = record[field];
      if (typeof candidate === 'string' && candidate) return candidate;
    }
  }
  return null;
}

export function createSecretResolver(env: NodeJS.ProcessEnv = process.env) {
  return async function secret(name: string): Promise<string | null> {
    const envVar = ENV_VARS[name];
    if (envVar && env[envVar]) return env[envVar] ?? null;

    const auth = await readJsonFile<Record<string, unknown>>(
      path.join(resolveSeroHome(env), 'agent', 'auth.json'),
    );
    return auth ? extractKey(auth[name]) : null;
  };
}
