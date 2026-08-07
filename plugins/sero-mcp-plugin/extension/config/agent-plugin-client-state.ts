import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMcpAppDir } from '../state/paths';

interface AgentPluginServerOverride {
  enabled?: boolean;
}

interface AgentPluginClientState {
  version: 1;
  servers: Record<string, AgentPluginServerOverride>;
}

const DEFAULT_STATE: AgentPluginClientState = { version: 1, servers: {} };

function statePath(): string {
  return path.join(getMcpAppDir(), 'agent-plugin-state.json');
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function normalize(raw: unknown): AgentPluginClientState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_STATE };
  const servers = (raw as { servers?: unknown }).servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return { ...DEFAULT_STATE };
  return {
    version: 1,
    servers: Object.fromEntries(Object.entries(servers).flatMap(([name, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const enabled = (value as { enabled?: unknown }).enabled;
      return typeof enabled === 'boolean' ? [[name, { enabled }]] : [];
    })),
  };
}

export async function readAgentPluginClientState(): Promise<AgentPluginClientState> {
  try {
    return normalize(JSON.parse(await fs.readFile(statePath(), 'utf8')));
  } catch (error) {
    if (isMissingFileError(error)) return { ...DEFAULT_STATE };
    throw error;
  }
}

export async function setAgentPluginServerEnabled(serverName: string, enabled: boolean): Promise<void> {
  const state = await readAgentPluginClientState();
  state.servers[serverName] = { ...state.servers[serverName], enabled };
  const filePath = statePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}
