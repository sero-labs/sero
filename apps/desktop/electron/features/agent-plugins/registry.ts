import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { InstalledAgentPlugin } from '@sero-ai/common';
import { AGENT_PLUGIN_REGISTRY_PATH } from './constants';

interface AgentPluginRegistryDocument {
  version: 1;
  plugins: InstalledAgentPlugin[];
}

const EMPTY_REGISTRY: AgentPluginRegistryDocument = { version: 1, plugins: [] };

function normalizeRegistry(raw: unknown): AgentPluginRegistryDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_REGISTRY;
  const candidate = raw as Partial<AgentPluginRegistryDocument>;
  return {
    version: 1,
    plugins: Array.isArray(candidate.plugins)
      ? candidate.plugins.filter((plugin): plugin is InstalledAgentPlugin => (
          !!plugin && typeof plugin === 'object' && typeof plugin.id === 'string'
        ))
      : [],
  };
}

export async function readAgentPluginRegistry(): Promise<AgentPluginRegistryDocument> {
  if (!existsSync(AGENT_PLUGIN_REGISTRY_PATH)) return EMPTY_REGISTRY;
  try {
    return normalizeRegistry(JSON.parse(await fs.readFile(AGENT_PLUGIN_REGISTRY_PATH, 'utf8')));
  } catch (error) {
    console.warn('[agent-plugins] Failed to read registry:', error);
    return EMPTY_REGISTRY;
  }
}

export function readAgentPluginRegistrySync(): AgentPluginRegistryDocument {
  if (!existsSync(AGENT_PLUGIN_REGISTRY_PATH)) return EMPTY_REGISTRY;
  try {
    return normalizeRegistry(JSON.parse(readFileSync(AGENT_PLUGIN_REGISTRY_PATH, 'utf8')));
  } catch (error) {
    console.warn('[agent-plugins] Failed to read registry:', error);
    return EMPTY_REGISTRY;
  }
}

export async function writeAgentPluginRegistry(plugins: InstalledAgentPlugin[]): Promise<void> {
  await fs.mkdir(path.dirname(AGENT_PLUGIN_REGISTRY_PATH), { recursive: true });
  const tempPath = `${AGENT_PLUGIN_REGISTRY_PATH}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify({ version: 1, plugins }, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, AGENT_PLUGIN_REGISTRY_PATH);
}
