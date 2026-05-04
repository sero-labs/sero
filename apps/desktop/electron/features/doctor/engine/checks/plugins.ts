/**
 * Plugin category checks.
 *
 * The engine cannot import the plugin manager directly (would violate
 * the engine isolation rule), so v1 inspects the settings.json plugin
 * list defensively and reports each entry's manifest reachability.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { registerDoctorCheck } from '../registry';
import { pluginDisableRepair } from '../repairs';
import type { DoctorCheck, DoctorResult } from '../types';
import { makeResult } from './helpers';
import type { ProfileSnapshot } from '../../profile-state/types';

interface MinimalPluginEntry {
  id?: unknown;
  installPath?: unknown;
  enabled?: unknown;
}

function readInstalledPlugins(profile: ProfileSnapshot | null): MinimalPluginEntry[] {
  if (!profile || !profile.files.settings.ok) return [];
  const value = profile.files.settings.value;
  if (!value || typeof value !== 'object') return [];
  const plugins = (value as { plugins?: unknown }).plugins;
  if (!Array.isArray(plugins)) return [];
  return plugins.filter((p): p is MinimalPluginEntry => !!p && typeof p === 'object');
}

function manifestExists(installPath: string): boolean {
  return (
    existsSync(path.join(installPath, 'plugin.json')) ||
    existsSync(path.join(installPath, 'package.json'))
  );
}

const manifestCheck: DoctorCheck = {
  id: 'plugins.manifest',
  category: 'plugins',
  needsBootedApp: true,
  async run(ctx) {
    const results: DoctorResult[] = [];
    const plugins = readInstalledPlugins(ctx.profile);
    if (plugins.length === 0) {
      const start = Date.now();
      results.push(
        makeResult({
          id: this.id,
          category: this.category,
          status: 'pass',
          message: 'No plugins installed.',
          start,
        }),
      );
      return results;
    }

    for (const plugin of plugins) {
      const start = Date.now();
      const id = typeof plugin.id === 'string' ? plugin.id : '<unknown>';
      const installPath =
        typeof plugin.installPath === 'string' ? plugin.installPath : null;
      const ok = installPath ? manifestExists(installPath) : false;
      results.push(
        makeResult({
          id: `plugins.${id}.manifest`,
          category: 'plugins',
          status: ok ? 'pass' : 'fail',
          message: ok
            ? `${id}: manifest reachable.`
            : `${id}: manifest missing or installPath invalid.`,
          fix: ok
            ? undefined
            : {
                kind: 'repair',
                repairId: pluginDisableRepair.id,
                description: pluginDisableRepair.description,
                destructive: pluginDisableRepair.destructive,
              },
          start,
        }),
      );
    }
    return results;
  },
};

const compatibilityCheck: DoctorCheck = {
  id: 'plugins.compatibility',
  category: 'plugins',
  needsBootedApp: true,
  async run(ctx) {
    const start = Date.now();
    const plugins = readInstalledPlugins(ctx.profile);
    if (plugins.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'No plugins to check for compatibility.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Plugin compatibility evaluation requires booted app context (deferred).',
      start,
    });
  },
};

const resourcesCheck: DoctorCheck = {
  id: 'plugins.resources',
  category: 'plugins',
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Plugin resource compatibility check deferred to v2.',
      start,
    });
  },
};

const loadCheck: DoctorCheck = {
  id: 'plugins.load',
  category: 'plugins',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Plugin sandboxed load check deferred to v2.',
      start,
    });
  },
};

export function registerPluginChecks(): void {
  registerDoctorCheck(manifestCheck);
  registerDoctorCheck(compatibilityCheck);
  registerDoctorCheck(resourcesCheck);
  registerDoctorCheck(loadCheck);
}
