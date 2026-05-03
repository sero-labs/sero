/**
 * Per-profile config file checks.
 *
 * Each check runs once per profile in `ctx.allProfiles`. The emitted
 * `DoctorResult.id` is suffixed with the profile id hash so multiple
 * profiles can be reported side-by-side.
 */

import { hashPath } from '../redaction';
import { registerDoctorCheck } from '../registry';
import {
  profileAuthResetRepair,
  profileEnvResetRepair,
  profileLayoutResetRepair,
  profileModelsResetRepair,
  profileSettingsResetRepair,
} from '../repairs';
import type {
  DoctorCheck,
  DoctorResult,
  DoctorRepair,
  DoctorContext,
} from '../types';
import type {
  ProfileSnapshot,
  ProfileSnapshotFiles,
  ReadResult,
} from '../../profile-state/types';
import { makeResult } from './helpers';

function suffix(profile: ProfileSnapshot): string {
  return hashPath(profile.path);
}

function classify(
  fileResult: ReadResult<unknown>,
): { status: 'pass' | 'warn' | 'fail'; message: string } {
  if (fileResult.ok) {
    return { status: 'pass', message: 'OK' };
  }
  switch (fileResult.error.kind) {
    case 'missing':
      return { status: 'warn', message: 'File missing.' };
    case 'denied':
      return { status: 'fail', message: 'Permission denied.' };
    case 'parse':
      return { status: 'fail', message: `Failed to parse: ${fileResult.error.message}` };
    case 'schema':
      return { status: 'fail', message: `Schema invalid: ${fileResult.error.message}` };
  }
}

function fileCheck(args: {
  baseId: string;
  label: string;
  pick: (files: ProfileSnapshotFiles) => ReadResult<unknown>;
  repair?: DoctorRepair;
}): DoctorCheck {
  return {
    id: args.baseId,
    category: 'profile',
    repair: args.repair,
    async run(ctx: DoctorContext): Promise<DoctorResult[]> {
      const results: DoctorResult[] = [];
      for (const profile of ctx.allProfiles) {
        const start = Date.now();
        const fileResult = args.pick(profile.files);
        const verdict = classify(fileResult);
        const fix = verdict.status === 'fail' && args.repair
          ? {
              kind: 'repair' as const,
              repairId: args.repair.id,
              description: args.repair.description,
              destructive: args.repair.destructive,
            }
          : undefined;
        results.push(
          makeResult({
            id: `${args.baseId}:${suffix(profile)}`,
            category: 'profile',
            status: verdict.status,
            message: `${profile.name} · ${args.label}: ${verdict.message}`,
            fix,
            details: { profileId: profile.id, profilePathHash: suffix(profile) },
            start,
          }),
        );
      }
      return results;
    },
  };
}

const dirExistsCheck: DoctorCheck = {
  id: 'profile.dir.exists',
  category: 'profile',
  async run(ctx) {
    const results: DoctorResult[] = [];
    for (const profile of ctx.allProfiles) {
      const start = Date.now();
      results.push(
        makeResult({
          id: `${this.id}:${suffix(profile)}`,
          category: 'profile',
          status: profile.pathExists ? 'pass' : 'fail',
          message: profile.pathExists
            ? `${profile.name} · directory exists.`
            : `${profile.name} · directory missing.`,
          details: { profileId: profile.id, profilePathHash: suffix(profile) },
          start,
        }),
      );
    }
    return results;
  },
};

const dirWritableCheck: DoctorCheck = {
  id: 'profile.dir.writable',
  category: 'profile',
  async run(ctx) {
    const results: DoctorResult[] = [];
    for (const profile of ctx.allProfiles) {
      const start = Date.now();
      const status = profile.agentDirWritable ? 'pass' : 'fail';
      results.push(
        makeResult({
          id: `${this.id}:${suffix(profile)}`,
          category: 'profile',
          status,
          message: profile.agentDirWritable
            ? `${profile.name} · agent/ writable.`
            : `${profile.name} · agent/ not writable or missing.`,
          details: { profileId: profile.id, profilePathHash: suffix(profile) },
          start,
        }),
      );
    }
    return results;
  },
};

const agentExistsCheck: DoctorCheck = {
  id: 'profile.agent.exists',
  category: 'profile',
  async run(ctx) {
    const results: DoctorResult[] = [];
    for (const profile of ctx.allProfiles) {
      const start = Date.now();
      results.push(
        makeResult({
          id: `${this.id}:${suffix(profile)}`,
          category: 'profile',
          status: profile.agentDirExists ? 'pass' : 'fail',
          message: profile.agentDirExists
            ? `${profile.name} · agent/ exists.`
            : `${profile.name} · agent/ missing.`,
          details: { profileId: profile.id, profilePathHash: suffix(profile) },
          start,
        }),
      );
    }
    return results;
  },
};

export function registerProfileChecks(): void {
  registerDoctorCheck(dirExistsCheck);
  registerDoctorCheck(dirWritableCheck);
  registerDoctorCheck(agentExistsCheck);

  registerDoctorCheck(
    fileCheck({
      baseId: 'profile.settings.parse',
      label: 'agent/settings.json',
      pick: (f) => f.settings,
      repair: profileSettingsResetRepair,
    }),
  );
  registerDoctorCheck(
    fileCheck({
      baseId: 'profile.auth.parse',
      label: 'agent/auth.json',
      pick: (f) => f.auth,
      repair: profileAuthResetRepair,
    }),
  );
  registerDoctorCheck(
    fileCheck({
      baseId: 'profile.env.parse',
      label: 'agent/.env',
      pick: (f) => f.env,
      repair: profileEnvResetRepair,
    }),
  );
  registerDoctorCheck(
    fileCheck({
      baseId: 'profile.models.parse',
      label: 'agent/models.json',
      pick: (f) => f.models,
      repair: profileModelsResetRepair,
    }),
  );
  registerDoctorCheck(
    fileCheck({
      baseId: 'profile.layout.parse',
      label: 'agent/layout.json',
      pick: (f) => f.layout,
      repair: profileLayoutResetRepair,
    }),
  );
}
