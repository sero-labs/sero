import path from 'node:path';
import { SERO_AGENT_DIR } from '@electron/platform/env';

export const AGENT_PLUGIN_VERSION = '1.0.0';
export const AGENT_PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const AGENT_PLUGIN_MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

export const AGENT_PLUGINS_DIR = path.join(SERO_AGENT_DIR, 'agent-plugins');
export const AGENT_PLUGIN_DATA_DIR = path.join(SERO_AGENT_DIR, 'agent-plugin-data');
export const AGENT_PLUGIN_REGISTRY_PATH = path.join(SERO_AGENT_DIR, 'agent-plugins.json');
export const AGENT_PLUGIN_STAGING_DIR = path.join(SERO_AGENT_DIR, '.agent-plugin-staging');
