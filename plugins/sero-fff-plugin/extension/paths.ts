/**
 * Profile-scoped storage locations for the FFF frecency and query-history
 * databases.
 *
 * Frecency is per Sero profile, never per workspace: two chats on the same
 * repository must rank files the same way, and a second profile must not
 * inherit the first profile's ranking. Both databases therefore live under the
 * agent directory that `SERO_HOME` / `PI_CODING_AGENT_DIR` resolve to.
 */

import { homedir } from 'node:os';
import path from 'node:path';

function expandHome(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

export function resolveAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const envDir = env.PI_CODING_AGENT_DIR?.trim();
  if (envDir) return expandHome(envDir);

  const seroHome = env.SERO_HOME?.trim() || path.join(homedir(), '.sero-ui');
  return path.join(seroHome, 'agent');
}

export interface FinderDbPaths {
  frecency: string;
  history: string;
}

export function resolveDbPaths(env: NodeJS.ProcessEnv = process.env): FinderDbPaths {
  const base = path.join(resolveAgentDir(env), 'fff');
  return {
    frecency: path.join(base, 'frecency'),
    history: path.join(base, 'history'),
  };
}
