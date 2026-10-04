import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { ContextOverrides, ContextToolInfo } from '@/types/ipc';
import { setSessionPromptOverride } from '@electron/features/apps/extensions/session-prompt-override';

const CONTEXT_OVERRIDES_CUSTOM_TYPE = 'sero-context-overrides';

export interface ContextOverrideSessionState {
  session: AgentSession;
  baseSystemPrompt: string;
  baseTools: ContextToolInfo[];
  contextOverrides: ContextOverrides | null;
}

function normalizeNames(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!name || seen.has(name)) continue;
    if (allowed && !allowed.has(name)) continue;
    seen.add(name);
    result.push(name);
  }

  return result;
}

function normalizeContextOverrides(
  value: unknown,
  allowedToolNames?: Set<string>,
): ContextOverrides | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const systemPrompt = typeof raw.systemPrompt === 'string' ? raw.systemPrompt : undefined;
  const disabledTools = normalizeNames(raw.disabledTools, allowedToolNames);
  const disabledSkills = normalizeNames(raw.disabledSkills);

  if (systemPrompt === undefined && disabledTools.length === 0 && disabledSkills.length === 0) {
    return null;
  }

  const overrides: ContextOverrides = {};

  if (systemPrompt !== undefined) {
    overrides.systemPrompt = systemPrompt;
  }
  if (disabledTools.length > 0) {
    overrides.disabledTools = disabledTools;
  }
  if (disabledSkills.length > 0) {
    overrides.disabledSkills = disabledSkills;
  }

  return overrides;
}

export function areContextOverridesEqual(
  left: ContextOverrides | null,
  right: ContextOverrides | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  const leftPrompt = typeof left.systemPrompt === 'string' ? left.systemPrompt : undefined;
  const rightPrompt = typeof right.systemPrompt === 'string' ? right.systemPrompt : undefined;
  if (leftPrompt !== rightPrompt) return false;

  const leftTools = left.disabledTools ?? [];
  const rightTools = right.disabledTools ?? [];
  if (leftTools.length !== rightTools.length) return false;
  if (leftTools.some((name, index) => name !== rightTools[index])) return false;

  const leftSkills = left.disabledSkills ?? [];
  const rightSkills = right.disabledSkills ?? [];
  if (leftSkills.length !== rightSkills.length) return false;
  if (leftSkills.some((name, index) => name !== rightSkills[index])) return false;

  return true;
}

export function readPersistedContextOverrides(
  session: AgentSession,
  toolNames: string[],
): ContextOverrides | null {
  const allowedToolNames = new Set(toolNames);
  // POC (#594, candidate 3): the current branch path, not the whole file, so a branch never
  // picks up an override written on a sibling branch.
  const entries = session.sessionManager.getBranch();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== 'custom' || entry.customType !== CONTEXT_OVERRIDES_CUSTOM_TYPE) {
      continue;
    }
    return normalizeContextOverrides(entry.data, allowedToolNames);
  }

  return null;
}

export function persistContextOverrides(
  session: AgentSession,
  overrides: ContextOverrides | null,
): void {
  // Sero writes a session's header when it creates the session, so the file exists and this entry is appended to it at once.
  session.sessionManager.appendCustomEntry(CONTEXT_OVERRIDES_CUSTOM_TYPE, overrides);
}

export function applyContextOverrides(
  entry: ContextOverrideSessionState,
  overrides: ContextOverrides | null,
): ContextOverrides | null {
  const normalized = normalizeContextOverrides(
    overrides,
    new Set(entry.baseTools.map((tool) => tool.name)),
  );

  const disabledTools = new Set(normalized?.disabledTools ?? []);
  const baseToolNames = entry.baseTools.map((tool) => tool.name);
  const currentlyActive = new Set(entry.session.getActiveToolNames());
  const previouslyDisabled = new Set(entry.contextOverrides?.disabledTools ?? []);
  // A tool an extension switched on after start-up, such as the goal terminal
  // tools, is not a base tool. Resetting to the base set would switch it off.
  const switchedOn = [...currentlyActive].filter((name) => !baseToolNames.includes(name));
  // A base tool that is off now was turned off either by an earlier override, which this call
  // may undo, or by an extension, which it must not: the goal terminal tools that were on when
  // the chat opened are off again once the goal ends.
  const activeToolNames = [...baseToolNames, ...switchedOn].filter(
    (name) => !disabledTools.has(name) && (currentlyActive.has(name) || previouslyDisabled.has(name)),
  );

  entry.session.setActiveToolsByName(activeToolNames);

  // The Sero host extension applies the prompt part at the start of each run.
  const hasPromptOverride = typeof normalized?.systemPrompt === 'string' || Boolean(normalized?.disabledSkills?.length);
  setSessionPromptOverride(entry.session.sessionManager, hasPromptOverride
    ? {
        ...(typeof normalized?.systemPrompt === 'string' ? { systemPrompt: normalized.systemPrompt } : {}),
        disabledSkills: normalized?.disabledSkills,
        // Read between runs and at the start of a run, when no run-time prompt is in effect.
        basePrompt: () => entry.session.systemPrompt,
      }
    : null);
  entry.contextOverrides = normalized;

  return normalized;
}

/**
 * `session.reload()` turns every extension tool on and rebuilds the system
 * prompt. Read the new base tools and prompt, then apply the saved overrides
 * again, so a reload never brings back a tool or prompt part the user removed.
 */
export async function reloadWithContextOverrides(entry: ContextOverrideSessionState): Promise<void> {
  const previousTools = entry.baseTools.map((tool) => tool.name);
  await entry.session.reload();
  // A disabled built-in tool is not active after the reload, but it is still a base tool.
  entry.session.setActiveToolsByName([...new Set([...previousTools, ...entry.session.getActiveToolNames()])]);
  entry.baseTools = entry.session.agent.state.tools.map((tool) => ({
    name: tool.name,
    label: (tool as { label?: string }).label,
    description: tool.description,
  }));
  entry.baseSystemPrompt = entry.session.systemPrompt;
  if (entry.contextOverrides) applyContextOverrides(entry, entry.contextOverrides);
}

/** After a move to another branch, apply the overrides that branch holds. */
export function syncContextOverridesToBranch(entry: ContextOverrideSessionState): void {
  const onBranch = readPersistedContextOverrides(entry.session, entry.baseTools.map((tool) => tool.name));
  if (!areContextOverridesEqual(onBranch, entry.contextOverrides)) applyContextOverrides(entry, onBranch);
}
