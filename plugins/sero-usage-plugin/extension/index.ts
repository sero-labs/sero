/**
 * Usage Extension — aggregates AI usage/cost from the active profile's
 * session .jsonl files into ~/.sero-ui (SERO_HOME)/apps/usage/state.json.
 *
 * Sero-only built-in plugin: paths resolve exclusively from SERO_HOME /
 * PI_CODING_AGENT_DIR (no ~/.pi fallback). Read-only against sessions.
 *
 * Spec: docs/specs/sero-usage-plugin-spec.md
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerUsageTool } from './tools';

export default function (pi: ExtensionAPI) {
  registerUsageTool(pi);
}
