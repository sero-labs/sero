/**
 * Authorized tools versus loaded tools, using Pi's own mechanism.
 *
 * A session registers every tool its approval allows. The tools outside the
 * initial loadout carry `exposure: 'deferred'`: Pi keeps them registered but
 * does not declare them to the model, and its `tool_search` finds one by
 * description and declares it. Pi records the loaded names in the session but
 * does not reload them when a session opens with an explicit tool list, so
 * `loadoutWithLoaded` adds them back on reopen.
 *
 * Nothing here grants anything. The caller decides what is authorized; this
 * only decides what starts loaded. A tool the session never registers is
 * invisible to `tool_search`, so the allowlist stays the hard bound.
 */

import {
  createToolSearchExtension,
  type ExtensionFactory,
  type LoadExtensionsResult,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { getCurrentSystemMessage } from '@earendil-works/pi-ai';

export const TOOL_SEARCH_TOOL_NAME = 'tool_search';

/** Pi's `tool_search`, registered inactive. Name it in the session's tool list to switch it on. */
export function createSeroToolSearchExtension(): ExtensionFactory {
  return createToolSearchExtension();
}

/** Only a tool that would load straight away is deferred. A tool that declares itself hidden stays hidden. */
function isDeferrable(tool: ToolDefinition): boolean {
  return tool.exposure === undefined || tool.exposure === 'direct';
}

/** The same tool, registered but not declared to the model. */
export function deferTool<T extends ToolDefinition>(tool: T): T {
  return isDeferrable(tool) ? { ...tool, exposure: 'deferred' } : tool;
}

/** Defers every tool that is not in the initial loadout. */
export function deferToolsOutside<T extends ToolDefinition>(tools: T[], loadout: ReadonlySet<string>): T[] {
  return tools.map((tool) => (loadout.has(tool.name) ? tool : deferTool(tool)));
}

/**
 * Defers the loaded extensions' tools that are not in the loadout, in place,
 * and returns the names it deferred. `tool_search` itself is never deferred.
 */
export function deferExtensionTools(base: LoadExtensionsResult, loadout: ReadonlySet<string>): string[] {
  const deferred: string[] = [];
  for (const extension of base.extensions) {
    for (const [name, registered] of extension.tools) {
      if (loadout.has(name) || name === TOOL_SEARCH_TOOL_NAME || !isDeferrable(registered.definition)) continue;
      extension.tools.set(name, { ...registered, definition: deferTool(registered.definition) });
      deferred.push(name);
    }
  }
  return deferred;
}

/** Why an authorized tool is not in the session. */
export type UnavailableReason = 'unavailable' | 'disabled' | 'unsupported' | 'denied';

export interface UnavailableTool {
  name: string;
  reason: UnavailableReason;
}

const REASON_TEXT: Record<UnavailableReason, string> = {
  unavailable: 'its plugin is not installed',
  disabled: 'turned off by the user',
  unsupported: 'not available to this kind of session',
  denied: 'outside the approval',
};

/** One line for the system prompt, or null when every authorized tool is present. */
export function unavailableToolsNote(tools: readonly UnavailableTool[]): string | null {
  if (tools.length === 0) return null;
  const list = tools.map((tool) => `${tool.name} (${REASON_TEXT[tool.reason]})`).join(', ');
  return `Approved tools that this session does not have: ${list}.`;
}

type SessionMessages = Parameters<typeof getCurrentSystemMessage>[0];

/**
 * The opening loadout plus the tools this session had loaded when it last
 * closed. Pi drops any name the session no longer registers, so a tool whose
 * approval was removed does not come back.
 */
export function loadoutWithLoaded(loadout: readonly string[], messages: SessionMessages): string[] {
  const loaded = getCurrentSystemMessage(messages)?.toolsAdded?.map((tool) => tool.name) ?? [];
  return [...new Set([...loadout, ...loaded])];
}
