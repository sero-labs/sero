import { readFile } from 'fs/promises';
import path from 'path';
import type { AppRuntimeProviderApiKey } from '@sero-ai/common';

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
};

function extractKey(cred: unknown): string | null {
  if (typeof cred === 'string' && cred) return cred;
  if (cred && typeof cred === 'object') {
    const record = cred as Record<string, unknown>;
    for (const field of ['key', 'apiKey', 'token', 'access']) {
      const value = record[field];
      if (typeof value === 'string' && value) return value;
    }
  }
  return null;
}

export async function getProviderApiKey(
  providerId: string,
  seroHome: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppRuntimeProviderApiKey | null> {
  const envVar = PROVIDER_ENV_VARS[providerId];
  if (!envVar) return null;

  const fromEnv = env[envVar];
  if (fromEnv) return { envVar, key: fromEnv };

  try {
    const raw = await readFile(path.join(seroHome, 'agent', 'auth.json'), 'utf8');
    const auth = JSON.parse(raw) as Record<string, unknown>;
    const key = extractKey(auth?.[providerId]);
    if (key) return { envVar, key };
  } catch {
    // Missing or unreadable auth.json → no key.
  }
  return null;
}
