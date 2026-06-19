import { readFileSync } from 'node:fs';
import type { GraphContextState } from './state';
import { QUERY_BUDGET } from './settings';

/** Build the system-prompt hint injected once per session via before_agent_start. */
export function buildGraphifySystemPrompt(): string {
  return (
    '[Graphify active] This profile has a Graphify knowledge graph for this workspace. ' +
    'Prefer graphify_query, graphify_path, and graphify_explain for architecture and ' +
    'cross-module questions, and graphify_search for cross-workspace questions, ' +
    'before broad codebase exploration.'
  );
}

/** Build a concise session orientation with suggested queries. */
export function buildSessionOrientation(
  state: GraphContextState,
  reportSnippet?: string,
  profileSummary?: string,
): string {
  const parts: string[] = [
    '[Graphify active] This workspace has a knowledge graph. Use Graphify for architecture, concept, and cross-file questions.',
  ];

  const available: string[] = [];
  if (state.graphExists) available.push('workspace graph');
  if (reportSnippet !== undefined) available.push('GRAPH_REPORT.md');
  if (profileSummary !== undefined) available.push('profile-wide graph');
  parts.push(`Available: ${available.join(', ')}.`);

  parts.push(
    'Good follow-ups:',
    '- graphify_query({ question: "What are the main communities in this codebase?" })',
    '- graphify_search({ question: "Which workspace owns <concept>?" })',
    '- graphify_explain({ concept: "<node name>" })',
  );

  if (reportSnippet) {
    parts.push(`\nReport summary: ${reportSnippet}`);
  }

  if (profileSummary) {
    parts.push(`\nProfile graph: ${profileSummary}`);
  }

  return parts.join('\n');
}

/** Read a bounded text file, returning up to maxChars characters or undefined. */
export function readBoundedText(filePath: string, maxChars: number): string | undefined {
  try {
    const buf = readFileSync(filePath, 'utf-8');
    return buf.length > maxChars ? buf.slice(0, maxChars) + '…' : buf;
  } catch {
    return undefined;
  }
}

/**
 * Extract a relevant snippet from GRAPH_REPORT.md based on trigger terms.
 * Returns up to maxChars from the best-matching section, or undefined.
 */
export function extractRelevantReportSnippet(
  reportText: string,
  terms: string[],
  maxChars: number,
): string | undefined {
  if (!reportText || !terms.length) return undefined;

  const lines = reportText.split('\n');
  let bestSection = '';
  let bestScore = 0;

  let currentSection: string[] = [];
  let currentScore = 0;

  for (const line of lines) {
    const isHeading = /^#{1,4}\s/.test(line);
    if (isHeading) {
      if (currentScore > bestScore && currentSection.length > 0) {
        bestSection = currentSection.join('\n');
        bestScore = currentScore;
      }
      currentSection = [line];
      currentScore = 0;
    } else {
      currentSection.push(line);
    }

    const lower = line.toLowerCase();
    for (const term of terms) {
      if (lower.includes(term.toLowerCase())) {
        currentScore += 1;
      }
    }
  }

  // Check last section
  if (currentScore > bestScore && currentSection.length > 0) {
    bestSection = currentSection.join('\n');
    bestScore = currentScore;
  }

  if (bestScore === 0) return undefined;
  return bestSection.length > maxChars ? bestSection.slice(0, maxChars) + '…' : bestSection;
}

/** Extract a cache key from a tool result event for deduplication. */
export function extractAugmentCacheKey(event: { toolName?: string; input?: unknown }): string {
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

  return candidate ? `${toolName}:${candidate}` : toolName;
}

/** Build the tool-result augmentation text appended to matching results. */
export function buildGraphifyAugmentContext(
  state: GraphContextState,
  suggestedQuestion?: string,
): string | undefined {
  if (!state.graphExists) return undefined;

  const question = suggestedQuestion
    ? `Suggested query: "${suggestedQuestion}"`
    : 'For architecture context, use graphify_query for the full BFS view.';

  return (
    `[Graphify] This result spans multiple concepts/files. ${question} ` +
    `Budget: ${QUERY_BUDGET}.`
  );
}
