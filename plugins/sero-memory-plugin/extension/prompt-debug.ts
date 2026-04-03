import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

interface PendingTurn {
  turn: number;
  prompt: string;
  promptHash: string;
  expectedSystemPromptHash: string;
}

const pendingTurns = new Map<string, PendingTurn>();
const turnCounters = new Map<string, number>();

interface TextSummary {
  chars: number;
  lines: number;
  hash: string;
}

interface ContextSectionSummary extends TextSummary {
  header: string;
}

export interface MemoryPromptDebugEntry {
  sessionId: string;
  prompt: string;
  incomingSystemPrompt: string;
  contextBlock: string;
  memoryInstructions: string;
  addition: string;
  needsBootstrap: boolean;
  snapshotMode: 'frozen' | 'live';
  qmdAvailable: boolean;
  skipSearch: boolean;
}

function resolveLogPath(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'debug', 'memory-prompt-debug.jsonl');
}

function ensureLogDir(): void {
  try {
    mkdirSync(path.dirname(resolveLogPath()), { recursive: true });
  } catch {
    // directory may already exist
  }
}

function rotateIfNeeded(logPath: string): void {
  try {
    const { size } = statSync(logPath);
    if (size >= MAX_LOG_SIZE) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {
    // file may not exist yet
  }
}

function writeEntry(data: Record<string, unknown>): void {
  if (!isMemoryPromptDebugEnabled()) return;
  try {
    const logPath = resolveLogPath();
    ensureLogDir();
    rotateIfNeeded(logPath);
    appendFileSync(logPath, `${JSON.stringify(data)}\n`, 'utf8');
  } catch {
    // debug logging must never crash the extension
  }
}

function nextTurn(sessionId: string): number {
  const turn = (turnCounters.get(sessionId) ?? 0) + 1;
  turnCounters.set(sessionId, turn);
  return turn;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function summarizeText(text: string): TextSummary {
  if (!text) return { chars: 0, lines: 0, hash: hashText('') };
  return {
    chars: text.length,
    lines: text.split('\n').length,
    hash: hashText(text),
  };
}

function summarizeContextSections(contextBlock: string): ContextSectionSummary[] {
  const trimmed = contextBlock.trim();
  if (!trimmed) return [];

  const sectionBody = trimmed.startsWith('## Memory\n\n')
    ? trimmed.slice('## Memory\n\n'.length)
    : trimmed;

  return sectionBody
    .split('\n\n---\n\n')
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section, index) => {
      const lines = section.split('\n');
      const header = lines[0]?.trim() || `section-${index + 1}`;
      return {
        header,
        ...summarizeText(section),
      };
    });
}

export function isMemoryPromptDebugEnabled(): boolean {
  const raw = process.env.SERO_MEMORY_PROMPT_DEBUG?.trim().toLowerCase();
  return raw ? ENABLED_VALUES.has(raw) : false;
}

export function clearMemoryPromptDebugState(sessionId: string): void {
  pendingTurns.delete(sessionId);
  turnCounters.delete(sessionId);
}

export function logMemoryPromptBeforeAgentStart(entry: MemoryPromptDebugEntry): void {
  if (!isMemoryPromptDebugEnabled()) return;

  const turn = nextTurn(entry.sessionId);
  const expectedSystemPrompt = entry.incomingSystemPrompt + entry.addition;
  const pending: PendingTurn = {
    turn,
    prompt: entry.prompt,
    promptHash: hashText(entry.prompt),
    expectedSystemPromptHash: hashText(expectedSystemPrompt),
  };
  pendingTurns.set(entry.sessionId, pending);

  writeEntry({
    _type: 'memory_prompt_before_agent_start',
    timestamp: new Date().toISOString(),
    sessionId: entry.sessionId,
    turn,
    needsBootstrap: entry.needsBootstrap,
    snapshotMode: entry.snapshotMode,
    qmdAvailable: entry.qmdAvailable,
    skipSearch: entry.skipSearch,
    prompt: entry.prompt,
    promptSummary: summarizeText(entry.prompt),
    incomingSystemPrompt: entry.incomingSystemPrompt,
    incomingSystemPromptSummary: summarizeText(entry.incomingSystemPrompt),
    contextBlock: entry.contextBlock,
    contextBlockSummary: summarizeText(entry.contextBlock),
    contextSections: summarizeContextSections(entry.contextBlock),
    memoryInstructions: entry.memoryInstructions,
    memoryInstructionsSummary: summarizeText(entry.memoryInstructions),
    addition: entry.addition,
    additionSummary: summarizeText(entry.addition),
    expectedSystemPromptSummary: summarizeText(expectedSystemPrompt),
  });
}

export function logMemoryPromptAgentStart(sessionId: string, effectiveSystemPrompt: string): void {
  if (!isMemoryPromptDebugEnabled()) return;

  const pending = pendingTurns.get(sessionId) ?? null;
  writeEntry({
    _type: 'memory_prompt_agent_start',
    timestamp: new Date().toISOString(),
    sessionId,
    turn: pending?.turn ?? null,
    prompt: pending?.prompt ?? null,
    promptHash: pending?.promptHash ?? null,
    effectiveSystemPrompt,
    effectiveSystemPromptSummary: summarizeText(effectiveSystemPrompt),
    matchesBeforeAgentStartExpectation: pending
      ? pending.expectedSystemPromptHash === hashText(effectiveSystemPrompt)
      : null,
  });
}
