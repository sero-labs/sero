/**
 * Memory system prompt instructions — injected into the agent's system prompt
 * on every turn via the context injector's `before_agent_start` hook.
 *
 * These instructions teach the agent:
 * 1. To ALWAYS use memory commands instead of bash/grep/find/read for memory files
 * 2. When to use `memory_search` vs `memory read` vs `memory search`
 * 3. How to write/replace/remove memory entries correctly
 */

import { isQmdAvailable } from './qmd';
import { resolveMemoryRoot } from './memory-manager';

export function getMemoryInstructions(): string {
  const root = resolveMemoryRoot();
  const hasSearch = isQmdAvailable();

  return [
    '\n\n## Memory System',
    '',
    `All memory files live in \`${root}\`. Run the commands below through the \`sero-cli\` tool. **Always use these memory commands** — never read/write/grep those files directly with bash, read, or edit tools. Direct file access bypasses IDs, timestamps, capacity limits, duplicate detection, transcript export, and search indexing.`,
    'Managed files include `MEMORY.md`, `IDENTITY.md`, `USER.md`, `SCRATCHPAD.md`, `memory/daily/`, and `memory/sessions/`.',
    '',
    ...getMemoryRetrievalInstructions(hasSearch),
    '',
    ...getMemoryStorageInstructions(),
  ].join('\n');
}

/**
 * Instructions for retrieving/searching memory — the "when to reach for memory" rules.
 *
 * These tell the agent to prefer memory_search over bash/grep/find
 * for any question about past context, conversations, or stored knowledge.
 */
function getMemoryRetrievalInstructions(hasSearch: boolean): string[] {
  const lines: string[] = [
    '### Retrieving information',
    '',
    '**When the user asks about past conversations, previous decisions, what was discussed, or anything that might be in memory — use `sero memory_search`, not bash/grep/find/read.**',
    '',
    '`sero memory_search` is the canonical recall/search path for Sero memory. It searches across long-term memory files AND exported session transcripts with ranked results. Bash tools cannot do this reliably — they miss transcripts, lack semantic matching, bypass indexing, and return raw file content instead of ranked excerpts.',
    '',
    'Use `memory_search` for:',
    '- "What did we discuss about X?" → `sero memory_search --query "X" --scope sessions`',
    '- "Do I have any memory about Y?" → `sero memory_search --query "Y" --scope memory`',
    '- "Search for Z across everything" → `sero memory_search --query "Z"` (defaults to `--scope all`)',
    '- Any question about past context, decisions, preferences, or conversation history',
    '',
    'Efficiency rule: start with ONE precise search query. If that first search already returns a direct answer, stop and answer the user. Only run a second search when the first search misses, is ambiguous, or needs broader recall.',
    '',
  ];

  if (hasSearch) {
    lines.push('Modes: `keyword` (fast, default) → `semantic` (conceptual matching) → `deep` (hybrid reranking). Escalate only if the first mode misses or stays ambiguous.');
  } else {
    lines.push('If `memory_search` reports that search indexing is unavailable, surface that limitation to the user and do NOT fall back to bash/read on managed memory files.');
  }

  lines.push(
    '',
    'Use `sero memory read` to view the full contents of a specific managed file:',
    '- `sero memory read --target memory [--with_ids true]` — view MEMORY.md (use --with_ids before replace/remove)',
    '- `sero memory read --target identity|user|daily`',
    '',
    'Use `sero memory search --query "..."` only for quick text grep across memory files (no transcripts, no ranked recall).',
    'Use `sero scratchpad list` to view SCRATCHPAD.md instead of reading it directly.',
  );

  return lines;
}

/** Instructions for writing/updating memory. */
function getMemoryStorageInstructions(): string[] {
  return [
    '### Storing information',
    '',
    '- `sero memory write --target memory|daily|user|identity --content "..." [--type fact|decision|preference|lesson|question|hypothesis] [--mode append|overwrite]`',
    '- `sero memory replace --target memory --entry_id "mem-..." --content "..."`',
    '- `sero memory remove --target memory --entry_id "mem-..."`',
    '- `sero memory consolidate [--schedule daily|weekly|off]` — run or configure automatic memory consolidation',
    '- `sero memory config [--snapshot frozen|live]` — control whether long-term memory is frozen per session or rebuilt each turn',
    '- `sero scratchpad add|done "..."`',
    '',
    'Guidelines:',
    '- Save durable preferences, decisions, project facts, and corrections to `memory`',
    '- Save session-specific progress, blockers, and follow-ups to `daily`',
    '- Read with IDs before updating memory so you replace stale entries instead of duplicating them',
    '- Use type tags: [fact], [decision], [preference], [lesson], [question], [hypothesis] — decisions and preferences are preserved first when memory is truncated',
    '- The memory tool assigns stable entry IDs automatically; do not edit raw files to manage them',
    '- If a file is near capacity, replace or remove stale memory instead of appending more',
  ];
}
