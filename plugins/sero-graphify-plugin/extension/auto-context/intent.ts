import { basename, extname } from 'node:path';

/** Kinds of Graphify intent derived from tool events. */
export type GraphifyIntentKind =
  | 'none'
  | 'broad-search'
  | 'overview-file'
  | 'architecture-question'
  | 'docs-or-plan'
  | 'multi-file-result';

/** Classified intent for Graphify augmentation. */
export interface GraphifyIntent {
  kind: GraphifyIntentKind;
  confidence: number;
  reason: string;
  suggestedQuestion?: string;
  cacheKey: string;
}

/** High-value files whose reads should trigger Graphify context. */
const HIGH_VALUE_READ_FILES = new Set([
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'package.json',
]);

/** High-value directory prefixes for file reads. */
const HIGH_VALUE_PREFIXES = ['docs/', 'plans/', 'skills/'];

/** Extension for doc-like files. */
const DOC_EXTENSIONS = new Set(['.md', '.mdx']);

/** Tool events to inspect. */
type ToolEvent = {
  toolName?: string;
  input?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

/** Check if a file path is a named high-value overview file (not directory-based). */
function isHighValueNamedFile(filePath: string): boolean {
  const name = basename(filePath);
  return HIGH_VALUE_READ_FILES.has(name);
}

/** Check if a file is a doc/plan in a recognized directory. */
function isDocOrPlanFile(filePath: string): boolean {
  for (const prefix of HIGH_VALUE_PREFIXES) {
    if (filePath.includes(prefix)) return true;
  }
  if (filePath.toLowerCase().includes('plan')) return true;
  return false;
}

/** Count approximate lines in tool result content. */
function countContentLines(content: Array<{ text?: string }>): number {
  let total = 0;
  for (const c of content) {
    if (c.text) total += c.text.split('\n').length;
  }
  return total;
}

/** Extract a text representation of the event input for pattern matching. */
function inputToText(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  const parts: string[] = [];
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') parts.push(val);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Classify a tool result event to determine whether Graphify augmentation
 * is appropriate, and at what confidence level.
 */
export function classifyGraphifyIntent(
  event: ToolEvent,
  triggerPatterns: string[],
): GraphifyIntent {
  const toolName = event.toolName ?? 'unknown';
  const cacheKey = buildCacheKey(event);
  const inputText = inputToText(event.input);

  // Broad search tools (find, grep variants) with significant results
  if (
    (toolName === 'find' || toolName === 'ffgrep' || toolName === 'grep' || toolName === 'fffind') &&
    event.content &&
    countContentLines(event.content) >= 5
  ) {
    return {
      kind: 'broad-search',
      confidence: 0.8,
      reason: `Broad ${toolName} result with multiple lines`,
      suggestedQuestion: 'How do these files relate in the system?',
      cacheKey,
    };
  }

  // High-value overview file reads
  if (toolName === 'read') {
    const input = event.input as Record<string, unknown> | undefined;
    const filePath = typeof input?.path === 'string' ? input.path : '';

    if (filePath && isHighValueNamedFile(filePath)) {
      return {
        kind: 'overview-file',
        confidence: 0.7,
        reason: `High-value file read: ${basename(filePath)}`,
        suggestedQuestion: `How does ${basename(filePath)} relate to the system architecture?`,
        cacheKey,
      };
    }

    // Doc/plan file reads
    const ext = extname(filePath).toLowerCase();
    if (DOC_EXTENSIONS.has(ext)) {
      if (isDocOrPlanFile(filePath)) {
        return {
          kind: 'docs-or-plan',
          confidence: 0.6,
          reason: `Doc/plan file read: ${basename(filePath)}`,
          suggestedQuestion: `What system concepts are connected to ${basename(filePath)}?`,
          cacheKey,
        };
      }
    }
  }

  // Multi-file results (any tool with lots of output)
  if (event.content && countContentLines(event.content) >= 20) {
    return {
      kind: 'multi-file-result',
      confidence: 0.5,
      reason: 'Large result spanning multiple lines',
      suggestedQuestion: 'What is the architecture around these files?',
      cacheKey,
    };
  }

  // Architecture-question: input contains trigger patterns
  if (inputText && triggerPatterns.length > 0) {
    for (const pattern of triggerPatterns) {
      if (inputText.includes(pattern.toLowerCase())) {
        return {
          kind: 'architecture-question',
          confidence: 0.7,
          reason: `Input contains architecture term: ${pattern}`,
          suggestedQuestion: `How does ${pattern} relate to the broader system?`,
          cacheKey,
        };
      }
    }
  }

  return {
    kind: 'none',
    confidence: 0,
    reason: 'No Graphify intent detected',
    cacheKey,
  };
}

/** Build a cache key from the tool event. */
function buildCacheKey(event: ToolEvent): string {
  const toolName = event.toolName ?? 'unknown';
  if (!event.input || typeof event.input !== 'object') return toolName;

  const input = event.input as Record<string, unknown>;
  const candidate =
    typeof input.pattern === 'string'
      ? input.pattern
      : typeof input.path === 'string'
        ? input.path
        : typeof input.command === 'string'
          ? input.command
          : '';

  return candidate ? `${toolName}:${candidate}`.toLowerCase() : toolName;
}
