/**
 * Agents app extension — minimal.
 *
 * Agent CRUD is handled by the subagent system's `create_agent` tool
 * and the app's UI via IPC. This extension exists to satisfy the
 * Pi package structure requirement.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (_pi: ExtensionAPI) {
  // No tools — agent management is handled by the subagent system's
  // create_agent tool and the Agents app UI via direct IPC.
}
