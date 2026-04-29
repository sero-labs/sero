import { homedir } from 'node:os';
import path from 'node:path';

function expandHome(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

export function resolveAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
  if (envDir) {
    return expandHome(envDir);
  }

  const seroHome = process.env.SERO_HOME?.trim() || path.join(homedir(), '.sero-ui');
  return path.join(seroHome, 'agent');
}

export function resolveSessionStoreDir(): string {
  return path.join(resolveAgentDir(), 'sessions');
}
