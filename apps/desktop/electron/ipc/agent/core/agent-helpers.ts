/**
 * Agent IPC helpers — validation, provider metadata, and command shaping.
 *
 * Message conversion and private SDK access now live in focused helpers:
 * `agent-messages.ts` and `sdk-private-adapter.ts`.
 */

import type { AgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { promises as fs } from 'fs';
import type {
  SeroSlashCommandInfo,
  SessionModelState,
} from '@/types/ipc';
import { buildAvailableModelGroups } from './model-groups';

export { nextId } from './agent-ids';
export {
  attachmentsToImages,
  buildTurnUndoMapByTurn,
  convertSessionMessages,
  findLatestTurnUndo,
  findLegacyTurnUndoEntryId,
  formatCustomMessage,
  projectCustomMessage,
} from './agent-messages';
export {
  getBaseSystemPrompt,
  rewriteSessionManagerFile,
  setBaseSystemPrompt,
  setRuntimeSessionModel,
} from './sdk-private-adapter';

// ── Validation ───────────────────────────────────────────────

const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
];

export function validateThinkingLevel(level: string): ThinkingLevel {
  const normalized = level.toLowerCase();
  if (VALID_THINKING_LEVELS.includes(normalized as ThinkingLevel)) {
    return normalized as ThinkingLevel;
  }
  throw new Error(
    `Invalid thinking level: "${level}". Valid levels: ${VALID_THINKING_LEVELS.join(', ')}`,
  );
}

export function validateProvider(provider: string): string {
  const normalized = provider.trim();
  if (!normalized) {
    throw new Error('Provider is required');
  }
  return normalized;
}

// ── Model state builder ──────────────────────────────────────

/** Subset of a pool entry needed by helper functions. */
export interface PoolEntryRef {
  session: AgentSession;
  loader: DefaultResourceLoader;
}

export function buildModelState(entry: Pick<PoolEntryRef, 'session'>): SessionModelState {
  const session = entry.session;
  const model = session.model;

  const available = session.modelRuntime.getAvailableSnapshot();
  const availableModels = buildAvailableModelGroups(available);

  const activeModel = model && available.some(
    (candidate) => candidate.provider === model.provider && candidate.id === model.id,
  )
    ? model
    : null;
  const inactiveModelLabel = available.length > 0 ? 'Select model' : 'No models available';

  const availableThinkingLevels = activeModel ? session.getAvailableThinkingLevels() : [];

  return {
    model: {
      provider: activeModel?.provider ?? 'unknown',
      api: activeModel?.api ?? 'unknown',
      modelId: activeModel?.id ?? 'unknown',
      name: activeModel?.name ?? inactiveModelLabel,
      reasoning: activeModel?.reasoning ?? false,
      availableThinkingLevels,
      supportsXhigh: availableThinkingLevels.includes('xhigh'),
      supportsMax: availableThinkingLevels.includes('max'),
    },
    thinkingLevel: activeModel ? session.thinkingLevel : 'off',
    availableThinkingLevels,
    supportsXhigh: availableThinkingLevels.includes('xhigh'),
    supportsMax: availableThinkingLevels.includes('max'),
    availableModels,
  };
}

// ── Hidden commands ──────────────────────────────────────────

/**
 * Read hiddenCommands from a settings config file.
 * Re-read on each call so edits take effect without restart.
 */
export async function readHiddenCommands(configPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (Array.isArray(config.hiddenCommands)) {
      return new Set(config.hiddenCommands as string[]);
    }
  } catch {
    // File missing or malformed — no hidden commands
  }
  return new Set();
}

// ── Slash command list builder ───────────────────────────────

export function buildCommandList(entry: PoolEntryRef, hidden?: Set<string>): SeroSlashCommandInfo[] {
  const runtime = entry.session.extensionRunner;
  if (!runtime) return [];

  const extensionCommands = runtime.getRegisteredCommands();
  const extCmds: SeroSlashCommandInfo[] = extensionCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    source: 'extension' as const,
  }));

  const { prompts } = entry.loader.getPrompts();
  const promptCmds: SeroSlashCommandInfo[] = prompts.map((prompt) => ({
    name: prompt.name,
    description: prompt.description,
    source: 'prompt' as const,
    path: prompt.sourceInfo.path,
  }));

  const { skills } = entry.loader.getSkills();
  const skillCmds: SeroSlashCommandInfo[] = skills.map((skill) => ({
    name: `skill:${skill.name}`,
    description: skill.description,
    source: 'skill' as const,
    path: skill.filePath,
  }));

  const all = [...extCmds, ...promptCmds, ...skillCmds];
  if (!hidden || hidden.size === 0) return all;
  return all.filter((command) => !hidden.has(command.name));
}

// ── Context override helpers ────────────────────────────────

/**
 * Strip disabled skills from the `<available_skills>` section of a system
 * prompt. Each skill is wrapped in `<skill><name>…</name>…</skill>`.
 */
export function stripDisabledSkills(prompt: string, disabled: Set<string>): string {
  return prompt.replace(
    /<skill>\s*\n\s*<name>([^<]+)<\/name>[\s\S]*?<\/skill>/g,
    (match, name: string) => (disabled.has(name.trim()) ? '' : match),
  );
}
