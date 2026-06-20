// Pi extension entry — registers the `orchestrator` control-plane tool and the
// `/orchestrator` slash command. Both forward to the workspace coordinator
// through the process-wide registry; neither runs work itself (D-01). This file
// is Pi-CLI-safe: it imports only from `shared/` and pi packages, never the
// Sero-only runtime.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerOrchestratorCommand } from './commands';
import { createOrchestratorTool } from './tools';

export default function (pi: ExtensionAPI) {
  pi.registerTool(createOrchestratorTool());
  registerOrchestratorCommand(pi);
}
