/**
 * Provider category checks.
 *
 * v1 does not perform live API calls. The engine isolation rule prevents
 * importing the provider catalog (which depends on third-party SDKs).
 * Instead we ship a small built-in list of well-known provider env names
 * and report which are present in `process.env`.
 *
 * Live provider-health snapshots remain available to in-app mode via the
 * `providers.health.live` check, which is gated behind `needsBootedApp`
 * and so is skipped in safe mode.
 */

import { registerDoctorCheck } from '../registry';
import type { DoctorCheck, DoctorResult } from '../types';
import { makeResult } from './helpers';

interface KnownProvider {
  id: string;
  envKey: string;
  displayName: string;
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  { id: 'anthropic', envKey: 'ANTHROPIC_API_KEY', displayName: 'Anthropic' },
  { id: 'openai', envKey: 'OPENAI_API_KEY', displayName: 'OpenAI' },
  { id: 'google', envKey: 'GOOGLE_API_KEY', displayName: 'Google (Gemini)' },
  { id: 'openrouter', envKey: 'OPENROUTER_API_KEY', displayName: 'OpenRouter' },
  { id: 'xai', envKey: 'XAI_API_KEY', displayName: 'xAI' },
  { id: 'groq', envKey: 'GROQ_API_KEY', displayName: 'Groq' },
  { id: 'cerebras', envKey: 'CEREBRAS_API_KEY', displayName: 'Cerebras' },
  { id: 'mistral', envKey: 'MISTRAL_API_KEY', displayName: 'Mistral' },
];

export function getKnownProviders(): readonly KnownProvider[] {
  return KNOWN_PROVIDERS;
}

const envCheck: DoctorCheck = {
  id: 'providers.env',
  category: 'providers',
  async run(ctx) {
    const results: DoctorResult[] = [];
    const profileEnvKeys = new Set<string>();
    if (ctx.profile?.files.env.ok) {
      for (const k of ctx.profile.files.env.value.keys) profileEnvKeys.add(k);
    }
    for (const provider of [...KNOWN_PROVIDERS].sort((a, b) => a.id.localeCompare(b.id))) {
      const start = Date.now();
      const inProcess = !!process.env[provider.envKey];
      const inProfile = profileEnvKeys.has(provider.envKey);
      const present = inProcess || inProfile;
      results.push(
        makeResult({
          id: `providers.${provider.id}.env`,
          category: 'providers',
          status: present ? 'pass' : 'warn',
          message: present
            ? `${provider.displayName} (${provider.envKey} present).`
            : `${provider.displayName} not configured (${provider.envKey} missing).`,
          start,
        }),
      );
    }
    return results;
  },
};

const anyUsableCheck: DoctorCheck = {
  id: 'providers.any-usable',
  category: 'providers',
  async run(ctx) {
    const start = Date.now();
    const profileEnvKeys = new Set<string>(
      ctx.profile?.files.env.ok ? ctx.profile.files.env.value.keys : [],
    );
    const any = KNOWN_PROVIDERS.some(
      (p) => !!process.env[p.envKey] || profileEnvKeys.has(p.envKey),
    );
    return makeResult({
      id: this.id,
      category: this.category,
      status: any ? 'pass' : 'fail',
      message: any
        ? 'At least one provider has an API key configured.'
        : 'No provider credentials found. Sero requires at least one configured provider.',
      start,
    });
  },
};

export function registerProviderChecks(): void {
  registerDoctorCheck(envCheck);
  registerDoctorCheck(anyUsableCheck);
}
