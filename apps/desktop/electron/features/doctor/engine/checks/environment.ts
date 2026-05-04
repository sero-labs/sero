/**
 * Environment variable audit.
 *
 * Produces a single `DoctorResult` whose `details.audit` is the
 * `EnvAudit` summary attached to the top-level report.
 */

import { registerDoctorCheck } from '../registry';
import type { DoctorCheck, EnvAudit } from '../types';
import { makeResult } from './helpers';
import { getKnownProviders } from './providers';

const REQUIRED = ['PATH', 'HOME', 'SHELL'] as const;
const RECOMMENDED: readonly string[] = [];

function listConfiguredProviderEnvKeys(profileEnvKeys: Set<string>): string[] {
  return getKnownProviders()
    .filter((p) => profileEnvKeys.has(p.envKey))
    .map((p) => p.envKey);
}

const audit: DoctorCheck = {
  id: 'environment.audit',
  category: 'environment',
  async run(ctx) {
    const start = Date.now();
    const profileEnvKeys = new Set<string>(
      ctx.profile?.files.env.ok ? ctx.profile.files.env.value.keys : [],
    );

    const presentSet = new Set<string>();
    for (const key of Object.keys(process.env)) {
      // Names only; the runtime values are never recorded.
      presentSet.add(key);
    }

    const missingRequired = REQUIRED.filter((k) => !presentSet.has(k));
    const missingRecommended = RECOMMENDED.filter((k) => !presentSet.has(k));

    const configuredProviderKeys = listConfiguredProviderEnvKeys(profileEnvKeys);
    const missingProviderEnv = configuredProviderKeys.filter((k) => !presentSet.has(k));

    const audit: EnvAudit = {
      present: [...presentSet].sort(),
      missing: missingRequired,
      recommended: missingRecommended,
    };

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Environment audit clean.';
    if (missingRequired.length > 0) {
      status = 'fail';
      message = `Missing required env vars: ${missingRequired.join(', ')}.`;
    } else if (missingProviderEnv.length > 0) {
      status = 'warn';
      message = `Configured provider env var${
        missingProviderEnv.length === 1 ? '' : 's'
      } missing in process: ${missingProviderEnv.join(', ')}.`;
    } else if (missingRecommended.length > 0) {
      status = 'warn';
      message = `Recommended env vars missing: ${missingRecommended.join(', ')}.`;
    }

    return makeResult({
      id: this.id,
      category: this.category,
      status,
      message,
      details: { audit },
      start,
    });
  },
};

export function registerEnvironmentChecks(): void {
  registerDoctorCheck(audit);
}
