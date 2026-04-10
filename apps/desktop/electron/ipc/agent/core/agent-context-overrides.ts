import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { ContextOverrides, ContextToolInfo } from '@/types/ipc';
import { setBaseSystemPrompt, stripDisabledSkills } from './agent-helpers';

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
  const entries = session.sessionManager.getEntries();

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
  session.sessionManager.appendCustomEntry(CONTEXT_OVERRIDES_CUSTOM_TYPE, overrides);

  const maybeRewriteFile = (session.sessionManager as unknown as { _rewriteFile?: () => void })._rewriteFile;
  if (typeof maybeRewriteFile === 'function') {
    maybeRewriteFile.call(session.sessionManager);
  }
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
  const activeToolNames = entry.baseTools
    .map((tool) => tool.name)
    .filter((name) => !disabledTools.has(name));

  entry.session.setActiveToolsByName(activeToolNames);

  let effectivePrompt =
    typeof normalized?.systemPrompt === 'string'
      ? normalized.systemPrompt
      : entry.baseSystemPrompt;

  if (normalized?.disabledSkills?.length) {
    effectivePrompt = stripDisabledSkills(effectivePrompt, new Set(normalized.disabledSkills));
  }

  setBaseSystemPrompt(entry.session, effectivePrompt);
  entry.contextOverrides = normalized;

  return normalized;
}
