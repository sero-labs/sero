/**
 * IPC handler registry.
 *
 * Each domain exports a register function. Call registerAllIpcHandlers()
 * once from main.ts on startup. To add a new domain, create a file in
 * this directory and add its registration call below.
 */

import { registerWorkspaceHandlers } from './workspace';
import { registerSessionHandlers } from './sessions';
import { registerAgentHandlers } from './agent';
import { registerShellHandlers } from './shell';

export function registerAllIpcHandlers(): void {
  registerWorkspaceHandlers();
  registerSessionHandlers();
  registerAgentHandlers();
  registerShellHandlers();
}
