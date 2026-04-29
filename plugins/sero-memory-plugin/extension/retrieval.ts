import type { MemorySearchScope, QmdSearchResult } from '../shared/types';
import { getResultPath, getResultText } from '../shared/types';

export type MemorySearchSource =
  | 'memory'
  | 'identity'
  | 'user'
  | 'scratchpad'
  | 'daily'
  | 'daily-summary'
  | 'session-transcript';

export interface RankedMemoryResult extends QmdSearchResult {
  normalizedPath?: string;
  source: MemorySearchSource;
  scope: Exclude<MemorySearchScope, 'all'>;
  sessionId?: string;
  anchorCount: number;
  matchedQueries: string[];
  finalScore: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'did', 'do', 'for',
  'from', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or',
  'our', 'should', 'that', 'the', 'their', 'them', 'there', 'this', 'to',
  'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'would', 'you', 'your',
]);

const TOKEN_EXPANSIONS: Record<string, string> = {
  ai: 'artificial intelligence',
  api: 'application programming interface',
  auth: 'authentication',
  cli: 'command line interface',
  db: 'database',
  e2e: 'end to end',
  llm: 'language model',
  qa: 'quality assurance',
  ts: 'typescript',
  ui: 'user interface',
  ux: 'user experience',
};

const SESSION_RECALL_PATTERN =
  /\b(discuss(?:ed)?|said|conversation|talked about|remember when|last week|last month|quote|recap|what did we)\b/i;
const EXCERPT_MAX_CHARS = 480;
const EXCERPT_CONTEXT_CHARS = 180;

export function normalizeSearchScope(value?: string): MemorySearchScope {
  if (value === 'memory' || value === 'sessions' || value === 'all') return value;
  return 'all';
}

export function buildPromptVariants(prompt: string): string[] {
  const sanitized = sanitizePrompt(prompt);
  if (!sanitized) return [];

  const tokens = extractMeaningfulTokens(sanitized);
  const variants = new Set<string>([sanitized]);

  if (tokens.length > 0) {
    variants.add(tokens.slice(0, 8).join(' '));

    const expandedTokens = tokens.map((token) => TOKEN_EXPANSIONS[token] ?? token);
    variants.add(expandedTokens.slice(0, 8).join(' '));

    const subject = expandedTokens.slice(0, 6).join(' ');
    if (subject) {
      variants.add(`what do we know about ${subject}`);
    }
  }

  return [...variants]
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter((value) => value.length >= 3)
    .slice(0, 3);
}

export function filterResultsByScope(
  results: QmdSearchResult[],
  scope: MemorySearchScope,
): QmdSearchResult[] {
  if (scope === 'all') return results;
  return results.filter((result) => classifyScope(getResultPath(result)) === scope);
}

export function rankMultiAnchorResults(args: {
  prompt: string;
  scope: MemorySearchScope;
  variantResults: Array<{ query: string; results: QmdSearchResult[] }>;
  limit: number;
}): RankedMemoryResult[] {
  const ranked = new Map<string, RankedMemoryResult & { bestScore: number; queries: Set<string> }>();

  for (const variant of args.variantResults) {
    for (const result of variant.results) {
      const normalizedPath = normalizePath(getResultPath(result));
      const resultScope = classifyScope(normalizedPath);
      if (args.scope !== 'all' && resultScope !== args.scope) continue;

      const text = getResultText(result);
      const source = classifySource(normalizedPath, text);
      const sessionId = extractSessionId(normalizedPath, text);
      const key = buildResultKey(normalizedPath, text);
      const baseScore = typeof result.score === 'number' ? result.score : 0;

      const existing = ranked.get(key);
      if (!existing) {
        ranked.set(key, {
          ...result,
          normalizedPath,
          source,
          scope: resultScope,
          sessionId,
          anchorCount: 1,
          matchedQueries: [variant.query],
          finalScore: 0,
          bestScore: baseScore,
          queries: new Set([variant.query]),
        });
        continue;
      }

      if (baseScore > existing.bestScore) {
        existing.bestScore = baseScore;
        existing.score = result.score;
        existing.content = result.content;
        existing.chunk = result.chunk;
        existing.snippet = result.snippet;
      }
      existing.queries.add(variant.query);
      existing.anchorCount = existing.queries.size;
      existing.matchedQueries = [...existing.queries];
      if (sessionId && !existing.sessionId) existing.sessionId = sessionId;
    }
  }

  const recallPrompt = isConversationRecallPrompt(args.prompt);
  const scored = [...ranked.values()].map((result) => ({
    ...result,
    anchorCount: result.queries.size,
    matchedQueries: [...result.queries],
    finalScore: result.bestScore
      + Math.max(0, result.queries.size - 1) * 0.3
      + sourceBonus(result.source, recallPrompt),
  }));

  scored.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return dedupeRankedResults(scored, recallPrompt, args.limit);
}

export function formatRankedResults(results: RankedMemoryResult[]): string {
  return results
    .map((result, index) => {
      const parts: string[] = [`### Result ${index + 1}`];
      const sourceLabel = formatSourceLabel(result.source);
      const filePath = result.normalizedPath ?? getResultPath(result);
      parts.push(`**Source:** ${sourceLabel}`);
      if (filePath) parts.push(`**File:** ${filePath}`);
      if (result.sessionId) parts.push(`**Session:** ${result.sessionId}`);
      if (typeof result.score === 'number') parts.push(`**Score:** ${result.score}`);

      const excerpt = buildResultExcerpt(result);
      if (excerpt) parts.push(`\n${excerpt}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');
}

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 200);
}

function extractMeaningfulTokens(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

  return [...new Set(tokens)];
}

function getDisplayText(result: QmdSearchResult): string {
  return (typeof result.snippet === 'string' && result.snippet.trim())
    || (typeof result.chunk === 'string' && result.chunk.trim())
    || getResultText(result).trim();
}

function stripMetadataLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^<!--\s*(source|session-id):/i.test(trimmed)) return false;
      if (/^#\s+Session\s+\d{4}-\d{2}-\d{2}\s+\([a-z0-9-]+\)$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildResultExcerpt(result: RankedMemoryResult): string {
  const raw = stripMetadataLines(getDisplayText(result));
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const tokens = [...new Set(
    result.matchedQueries
      .flatMap((query) => extractMeaningfulTokens(query))
      .filter((token) => token.length >= 3),
  )];

  let excerpt = raw;
  let matchIndex = -1;
  let matchLength = 0;

  for (const token of tokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index >= 0 && (matchIndex < 0 || index < matchIndex)) {
      matchIndex = index;
      matchLength = token.length;
    }
  }

  if (matchIndex >= 0) {
    const start = Math.max(0, matchIndex - EXCERPT_CONTEXT_CHARS);
    const end = Math.min(
      raw.length,
      matchIndex + Math.max(matchLength, 80) + EXCERPT_CONTEXT_CHARS,
    );
    excerpt = raw.slice(start, end).trim();
    if (start > 0) excerpt = `...${excerpt}`;
    if (end < raw.length) excerpt = `${excerpt}...`;
  }

  return clipExcerpt(excerpt, EXCERPT_MAX_CHARS);
}

function buildResultKey(path: string | undefined, text: string): string {
  const excerpt = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return `${path ?? 'unknown'}::${excerpt}`;
}

function normalizePath(value: string | undefined): string | undefined {
  return value?.replace(/\\/g, '/');
}

function classifyScope(path: string | undefined): Exclude<MemorySearchScope, 'all'> {
  if (path?.includes('memory/sessions/')) return 'sessions';
  return 'memory';
}

function classifySource(path: string | undefined, text: string): MemorySearchSource {
  const normalized = path ?? '';
  if (normalized.includes('memory/sessions/')) return 'session-transcript';
  if (/<!--\s*source:\s*daily-summary\s*-->/i.test(text)) return 'daily-summary';
  if (normalized.endsWith('/MEMORY.md') || normalized === 'MEMORY.md') return 'memory';
  if (normalized.endsWith('/IDENTITY.md') || normalized === 'IDENTITY.md') return 'identity';
  if (normalized.endsWith('/USER.md') || normalized === 'USER.md') return 'user';
  if (normalized.endsWith('/SCRATCHPAD.md') || normalized === 'SCRATCHPAD.md') return 'scratchpad';
  return 'daily';
}

function extractSessionId(path: string | undefined, text: string): string | undefined {
  const fromText = text.match(/<!--\s*session-id:\s*([a-zA-Z0-9_-]+)\s*-->/i)?.[1];
  if (fromText) return fromText;

  const fromPath = path?.match(/memory\/sessions(?:\/archive\/\d{4}\/\d{2})?\/\d{4}-\d{2}-\d{2}-([a-zA-Z0-9_-]+)\.md$/)?.[1];
  return fromPath;
}

function sourceBonus(source: MemorySearchSource, recallPrompt: boolean): number {
  if (recallPrompt) {
    if (source === 'session-transcript') return 0.35;
    if (source === 'daily-summary') return -0.05;
    return 0;
  }

  if (source === 'daily-summary') return 0.15;
  if (source === 'session-transcript') return -0.05;
  return 0;
}

function isConversationRecallPrompt(prompt: string): boolean {
  return SESSION_RECALL_PATTERN.test(prompt);
}

function dedupeRankedResults(
  results: RankedMemoryResult[],
  recallPrompt: boolean,
  limit: number,
): RankedMemoryResult[] {
  const selected: RankedMemoryResult[] = [];
  const seenSessionSources = new Map<string, Set<'session-transcript' | 'daily-summary'>>();

  for (const result of results) {
    if (selected.length >= limit) break;

    const sessionSource = result.source === 'session-transcript' || result.source === 'daily-summary'
      ? result.source
      : null;
    if (sessionSource && result.sessionId) {
      const seen = seenSessionSources.get(result.sessionId) ?? new Set<'session-transcript' | 'daily-summary'>();
      if (seen.has(sessionSource)) continue;

      if (recallPrompt && sessionSource === 'daily-summary' && seen.has('session-transcript')) {
        continue;
      }
      if (!recallPrompt && sessionSource === 'session-transcript' && seen.has('daily-summary')) {
        continue;
      }

      seen.add(sessionSource);
      seenSessionSources.set(result.sessionId, seen);
    }

    selected.push(result);
  }

  return selected;
}

function formatSourceLabel(source: MemorySearchSource): string {
  switch (source) {
    case 'session-transcript':
      return 'Session transcript';
    case 'daily-summary':
      return 'Daily summary';
    case 'memory':
      return 'Memory';
    case 'identity':
      return 'Identity';
    case 'user':
      return 'User';
    case 'scratchpad':
      return 'Scratchpad';
    case 'daily':
      return 'Daily log';
  }
}
