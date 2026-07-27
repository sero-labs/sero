/**
 * Design Library extension — the tool surface for the UI and the agent.
 *
 * Everything here is Pi-safe: no Sero imports, no desktop internals. Reads
 * answer straight from plugin-owned records; writes append intent for the
 * background runtime, which is the single authoritative writer (spec §12).
 *
 * `sero.plugin.bridgeTools` exposes the items and analysis tools to the main
 * Sero agent, so the library is searchable and readable from any chat.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { resolveDesignLibraryPaths } from '../shared/paths';
import { registerAnalysisTool } from './tools/analysis';
import { registerAssetTool } from './tools/assets';
import { registerDesignTool } from './tools/designs';
import { registerItemTool } from './tools/items';
import { registerSettingsTool } from './tools/settings';

export default function designLibraryExtension(pi: ExtensionAPI): void {
  const paths = resolveDesignLibraryPaths();

  registerAssetTool(pi, paths);
  registerItemTool(pi, paths);
  registerAnalysisTool(pi, paths);
  registerDesignTool(pi, paths);
  registerSettingsTool(pi, paths);
}
