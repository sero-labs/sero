/**
 * Repair scaffolds.
 *
 * v1: registered alongside checks and addressable by ID, but not invokable.
 * v2 will replace these stubs with implementations that perform the
 * file moves / native rebuilds documented in the spec.
 */

import type { DoctorRepair, RepairResult } from '../types';

const NOT_INVOCABLE: RepairResult = {
  status: 'skipped',
  message: 'Auto-repair is not yet enabled in this version of Sero.',
};

function stub(id: string, description: string, destructive: boolean): DoctorRepair {
  return {
    id,
    description,
    destructive,
    run: async () => NOT_INVOCABLE,
  };
}

export const profileSettingsResetRepair = stub(
  'repair.profile.settings.reset',
  'Back up agent/settings.json and restore default settings.',
  true,
);

export const profileAuthResetRepair = stub(
  'repair.profile.auth.reset',
  'Back up agent/auth.json and clear stored credentials (forces re-login).',
  true,
);

export const profileEnvResetRepair = stub(
  'repair.profile.env.reset',
  'Back up agent/.env and write an empty template.',
  true,
);

export const profileModelsResetRepair = stub(
  'repair.profile.models.reset',
  'Back up agent/models.json and restore default model configuration.',
  true,
);

export const profileLayoutResetRepair = stub(
  'repair.profile.layout.reset',
  'Back up agent/layout.json and restore default layout.',
  true,
);

export const profileRegistryRebuildRepair = stub(
  'repair.profile.registry.rebuild',
  'Back up profiles.json and rebuild it from the on-disk profile directories.',
  true,
);

export const profileRegistryActiveIdRepair = stub(
  'repair.profile.registry.activeIdRepair',
  'Reset profiles.json activeProfileId to a profile that still exists.',
  false,
);

export const nativeRebuildNodePtyRepair = stub(
  'repair.native.rebuild-node-pty',
  'Rebuild node-pty against the current Electron ABI.',
  false,
);

export const nativeRebuildBetterSqlite3Repair = stub(
  'repair.native.rebuild-better-sqlite3',
  'Rebuild better-sqlite3 against the current Electron ABI.',
  false,
);

export const containerStartRepair = stub(
  'repair.container.start',
  'Start the Apple Container system service.',
  false,
);

export const pluginDisableRepair = stub(
  'repair.plugin.disable',
  'Disable an incompatible plugin and rename its install directory.',
  true,
);

export const ALL_REPAIRS: DoctorRepair[] = [
  profileSettingsResetRepair,
  profileAuthResetRepair,
  profileEnvResetRepair,
  profileModelsResetRepair,
  profileLayoutResetRepair,
  profileRegistryRebuildRepair,
  profileRegistryActiveIdRepair,
  nativeRebuildNodePtyRepair,
  nativeRebuildBetterSqlite3Repair,
  containerStartRepair,
  pluginDisableRepair,
];
