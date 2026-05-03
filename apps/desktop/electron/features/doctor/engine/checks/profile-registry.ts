/**
 * Profile registry checks (~/.sero-ui/profiles.json).
 *
 * Reads the file lenently — no exception is allowed to propagate.
 */

import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { registerDoctorCheck } from '../registry';
import {
  profileRegistryActiveIdRepair,
  profileRegistryRebuildRepair,
} from '../repairs';
import type { DoctorCheck } from '../types';
import { makeResult } from './helpers';

const REGISTRY_PATH = path.join(os.homedir(), '.sero-ui', 'profiles.json');

interface ParsedRegistry {
  raw: unknown;
  ok: boolean;
  parseError?: string;
}

function readRegistry(): ParsedRegistry & { exists: boolean } {
  if (!existsSync(REGISTRY_PATH)) {
    return { exists: false, raw: null, ok: false };
  }
  try {
    const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as unknown;
    return { exists: true, raw, ok: true };
  } catch (err) {
    return {
      exists: true,
      raw: null,
      ok: false,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

const existsCheck: DoctorCheck = {
  id: 'profile.registry.exists',
  category: 'profile',
  async run() {
    const start = Date.now();
    if (existsSync(REGISTRY_PATH)) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'profiles.json present.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: 'profiles.json not found (will be created on first profile setup).',
      start,
    });
  },
};

const parseCheck: DoctorCheck = {
  id: 'profile.registry.parse',
  category: 'profile',
  repair: profileRegistryRebuildRepair,
  async run() {
    const start = Date.now();
    const parsed = readRegistry();
    if (!parsed.exists) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'No registry to parse yet.',
        start,
      });
    }
    if (!parsed.ok) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: `profiles.json failed to parse: ${parsed.parseError}`,
        fix: {
          kind: 'repair',
          repairId: profileRegistryRebuildRepair.id,
          description: profileRegistryRebuildRepair.description,
          destructive: profileRegistryRebuildRepair.destructive,
        },
        start,
      });
    }
    if (
      typeof parsed.raw !== 'object' ||
      parsed.raw === null ||
      !Array.isArray((parsed.raw as { profiles?: unknown }).profiles)
    ) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: 'profiles.json schema is invalid.',
        fix: {
          kind: 'repair',
          repairId: profileRegistryRebuildRepair.id,
          description: profileRegistryRebuildRepair.description,
          destructive: profileRegistryRebuildRepair.destructive,
        },
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'profiles.json parses and matches schema.',
      start,
    });
  },
};

const activeIdCheck: DoctorCheck = {
  id: 'profile.registry.activeIdResolves',
  category: 'profile',
  repair: profileRegistryActiveIdRepair,
  async run() {
    const start = Date.now();
    const parsed = readRegistry();
    if (!parsed.ok || typeof parsed.raw !== 'object' || parsed.raw === null) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Skipped: registry could not be parsed.',
        start,
      });
    }
    const reg = parsed.raw as { activeProfileId?: unknown; profiles?: unknown };
    if (reg.activeProfileId == null) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'No active profile (setup not complete).',
        start,
      });
    }
    const profiles = Array.isArray(reg.profiles) ? reg.profiles : [];
    const found = profiles.some(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as { id?: unknown }).id === 'string' &&
        (p as { id: string }).id === reg.activeProfileId,
    );
    if (found) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'activeProfileId resolves to a registered profile.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'fail',
      message: 'activeProfileId points to a profile that no longer exists.',
      fix: {
        kind: 'repair',
        repairId: profileRegistryActiveIdRepair.id,
        description: profileRegistryActiveIdRepair.description,
        destructive: profileRegistryActiveIdRepair.destructive,
      },
      start,
    });
  },
};

const orphansCheck: DoctorCheck = {
  id: 'profile.registry.orphans',
  category: 'profile',
  async run(ctx) {
    const start = Date.now();
    const orphans = ctx.allProfiles.filter((p) => p.isOrphan);
    if (orphans.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'No orphan profile directories.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: `${orphans.length} orphan profile director${orphans.length === 1 ? 'y' : 'ies'} on disk.`,
      details: { orphanCount: orphans.length },
      start,
    });
  },
};

export function registerProfileRegistryChecks(): void {
  registerDoctorCheck(existsCheck);
  registerDoctorCheck(parseCheck);
  registerDoctorCheck(activeIdCheck);
  registerDoctorCheck(orphansCheck);
}
