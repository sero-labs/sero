import type { ToolProbe } from '../types';
import { mcpProbe } from './mcp';
import { mcpManagerProbe } from './mcp-manager';

/** `mcp_manager` runs first and leaves the fixture servers set up; `mcp` prepares its own, so it does not rely on that. */
export const mcpProbes: ToolProbe[] = [mcpManagerProbe, mcpProbe];
