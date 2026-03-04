/**
 * Resources app extension — minimal.
 *
 * Agent and skill CRUD is handled by the UI via IPC.
 * This extension exists to satisfy the Pi package structure requirement.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (_pi: ExtensionAPI) {
  // No tools — resource management is handled by the app UI via direct IPC.
}
