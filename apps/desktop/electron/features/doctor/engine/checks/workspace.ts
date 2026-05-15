/**
 * Workspace category checks.
 *
 * All require a booted app (`needsBootedApp: true`). In safe mode they
 * are skipped via `listChecks({ safe: true })`.
 */

import { existsSync, accessSync, constants, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { registerDoctorCheck } from '../registry';
import type { DoctorCheck } from '../types';
import { makeResult } from './helpers';
import type { ProfileSnapshot } from '../../profile-state/types';

interface MinimalWorkspace {
  id?: unknown;
  path?: unknown;
  container?: unknown;
}

function readWorkspaces(profile: ProfileSnapshot | null): MinimalWorkspace[] {
  if (!profile) return [];
  const value = profile.files.workspaces.ok ? profile.files.workspaces.value : null;
  if (!value || typeof value !== 'object') return [];
  const record = value as { entries?: unknown; workspaces?: unknown };
  const entries = Array.isArray(record.workspaces) ? record.workspaces : record.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((e): e is MinimalWorkspace => !!e && typeof e === 'object');
}

const existsCheck: DoctorCheck = {
  id: 'workspace.exists',
  category: 'workspace',
  needsBootedApp: true,
  async run(ctx) {
    const start = Date.now();
    const workspaces = readWorkspaces(ctx.profile);
    if (workspaces.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: 'No workspaces registered.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} registered.`,
      start,
    });
  },
};

const runtimeSelectedCheck: DoctorCheck = {
  id: 'workspace.runtime.selected',
  category: 'workspace',
  needsBootedApp: true,
  async run(ctx) {
    const start = Date.now();
    const workspaces = readWorkspaces(ctx.profile);
    if (workspaces.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'No workspaces to inspect.',
        start,
      });
    }
    const all = workspaces.every(workspaceHasRuntimePreference);
    return makeResult({
      id: this.id,
      category: this.category,
      status: all ? 'pass' : 'warn',
      message: all
        ? 'All workspaces have a runtime selected.'
        : 'One or more workspaces have no runtime preference recorded.',
      start,
    });
  },
};

function workspaceHasRuntimePreference(workspace: MinimalWorkspace): boolean {
  if (typeof workspace.path !== 'string') return false;
  try {
    const raw = readFileSync(path.join(workspace.path, '.sero-workspace.json'), 'utf8');
    const config = JSON.parse(raw) as { runtime?: { backend?: unknown }; container?: unknown };
    return typeof config.runtime?.backend === 'string' || typeof config.container === 'boolean';
  } catch {
    return false;
  }
}

const fsAccessibleCheck: DoctorCheck = {
  id: 'workspace.fs.accessible',
  category: 'workspace',
  needsBootedApp: true,
  async run(ctx) {
    const start = Date.now();
    const workspaces = readWorkspaces(ctx.profile);
    const inaccessible: string[] = [];
    for (const ws of workspaces) {
      if (typeof ws.path !== 'string') continue;
      if (!existsSync(ws.path)) {
        inaccessible.push(typeof ws.id === 'string' ? ws.id : '<unknown>');
        continue;
      }
      try {
        accessSync(ws.path, constants.R_OK);
      } catch {
        inaccessible.push(typeof ws.id === 'string' ? ws.id : '<unknown>');
      }
    }
    if (inaccessible.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'All workspace roots are readable.',
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'fail',
      message: `${inaccessible.length} workspace root${inaccessible.length === 1 ? '' : 's'} not readable.`,
      details: { count: inaccessible.length },
      start,
    });
  },
};

const registryConsistencyCheck: DoctorCheck = {
  id: 'workspace.registry.consistency',
  category: 'workspace',
  needsBootedApp: true,
  async run(ctx) {
    const start = Date.now();
    const workspaces = readWorkspaces(ctx.profile);
    const missing = workspaces
      .filter((ws) => typeof ws.path === 'string' && !existsSync(ws.path))
      .map((ws) => String(ws.id ?? ws.path));
    const registeredPaths = new Set(workspaces
      .filter((ws): ws is MinimalWorkspace & { path: string } => typeof ws.path === 'string')
      .map((ws) => path.resolve(ws.path)));
    const unregistered = ctx.profile ? findUnregisteredManagedWorkspaces(ctx.profile.path, registeredPaths) : [];

    if (missing.length === 0 && unregistered.length === 0) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'Workspace registry matches available managed workspaces.',
        start,
      });
    }

    return makeResult({
      id: this.id,
      category: this.category,
      status: 'warn',
      message: 'Workspace registry has missing entries or recoverable managed workspaces.',
      details: { missing, unregistered },
      fix: {
        kind: 'manual',
        instructions: 'Restart Sero to auto-register managed workspaces under <profile>/workspaces. If a missing workspace was on removable media, reconnect the drive and click Check again; otherwise close the stale workspace from the sidebar.',
      },
      start,
    });
  },
};

function findUnregisteredManagedWorkspaces(profilePath: string, registeredPaths: Set<string>): string[] {
  const workspacesDir = path.join(profilePath, 'workspaces');
  if (!existsSync(workspacesDir)) return [];
  return readdirSync(workspacesDir)
    .map((entry) => path.join(workspacesDir, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory()
          && existsSync(path.join(entryPath, '.sero-workspace.json'))
          && !registeredPaths.has(path.resolve(entryPath));
      } catch {
        return false;
      }
    });
}

const execSmokeCheck: DoctorCheck = {
  id: 'workspace.exec.smoke',
  category: 'workspace',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Workspace exec smoke test deferred to v2.',
      start,
    });
  },
};

const terminalSmokeCheck: DoctorCheck = {
  id: 'workspace.terminal.smoke',
  category: 'workspace',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Workspace terminal smoke test deferred to v2.',
      start,
    });
  },
};

const previewPortCheck: DoctorCheck = {
  id: 'workspace.preview.port',
  category: 'workspace',
  slow: true,
  needsBootedApp: true,
  async run() {
    const start = Date.now();
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Workspace preview port probe deferred to v2.',
      start,
    });
  },
};

const safeModeNotice: DoctorCheck = {
  id: 'workspace.skipped.safe-mode',
  category: 'workspace',
  needsBootedApp: false,
  async run(ctx) {
    const start = Date.now();
    if (ctx.mode !== 'safe') {
      return [];
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: 'Workspace checks were skipped (safe mode).',
      start,
    });
  },
};

export function registerWorkspaceChecks(): void {
  registerDoctorCheck(existsCheck);
  registerDoctorCheck(runtimeSelectedCheck);
  registerDoctorCheck(fsAccessibleCheck);
  registerDoctorCheck(registryConsistencyCheck);
  registerDoctorCheck(execSmokeCheck);
  registerDoctorCheck(terminalSmokeCheck);
  registerDoctorCheck(previewPortCheck);
  registerDoctorCheck(safeModeNotice);
}
