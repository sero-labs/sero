/**
 * The `mcp_manager` tool: server config, connection, auth, resources, the app
 * viewer, tasks and remote skills. The steps run in one chat, in four parts
 * (config, runtime, tasks, auth) that share the fixture server the config
 * part registers.
 */
import type { ToolProbe } from '../types';
import { authSteps } from './mcp-manager-auth';
import { configSteps } from './mcp-manager-config';
import { runtimeSteps } from './mcp-manager-runtime';
import { taskSteps } from './mcp-manager-tasks';

export const mcpManagerProbe: ToolProbe = {
  tool: 'mcp_manager',
  timeoutMs: 240_000,
  steps: [...configSteps, ...runtimeSteps, ...taskSteps, ...authSteps],
};
