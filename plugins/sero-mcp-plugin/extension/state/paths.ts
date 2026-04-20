import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_PI_AGENT_DIR = path.join(homedir(), '.pi', 'agent');
const STATE_RELATIVE_PATH = path.join('.sero', 'apps', 'mcp', 'state.json');

function expandHome(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

function getEnvPath(name: 'SERO_HOME' | 'PI_CODING_AGENT_DIR'): string | null {
  const value = process.env[name]?.trim();
  return value ? expandHome(value) : null;
}

export function getSeroHomeDir(): string | null {
  return getEnvPath('SERO_HOME');
}

export function getPiAgentDir(): string {
  return getEnvPath('PI_CODING_AGENT_DIR') ?? DEFAULT_PI_AGENT_DIR;
}

export function getMcpAppDir(): string {
  const seroHome = getSeroHomeDir();
  if (seroHome) return path.join(seroHome, 'apps', 'mcp');
  return path.join(getPiAgentDir(), 'mcp');
}

export function getMcpStatePath(cwd?: string): string {
  const seroHome = getSeroHomeDir();
  if (seroHome) return path.join(seroHome, 'apps', 'mcp', 'state.json');
  if (cwd?.trim()) return path.join(path.resolve(cwd), STATE_RELATIVE_PATH);
  return path.join(getPiAgentDir(), 'mcp-state.json');
}

export function getMcpConfigPath(): string {
  const seroHome = getSeroHomeDir();
  if (seroHome) return path.join(seroHome, 'apps', 'mcp', 'config.json');
  return path.join(getPiAgentDir(), 'mcp.json');
}

export function getMcpMetadataCachePath(): string {
  const seroHome = getSeroHomeDir();
  if (seroHome) return path.join(seroHome, 'apps', 'mcp', 'metadata-cache.json');
  return path.join(getPiAgentDir(), 'mcp-cache.json');
}

export function getMcpOAuthDir(): string {
  return path.join(getPiAgentDir(), 'mcp-oauth');
}

export function getMcpOAuthTokenPath(serverName: string): string {
  return path.join(getMcpOAuthDir(), encodeURIComponent(serverName), 'tokens.json');
}
