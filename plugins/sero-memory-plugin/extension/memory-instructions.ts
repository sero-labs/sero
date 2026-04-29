/**
 * Memory system prompt instructions — injected into the agent's system prompt
 * on every turn via the context injector's `before_agent_start` hook.
 *
 * This is the SINGLE SOURCE OF TRUTH for memory-related agent instructions.
 * Other prompt sources (AGENTS.md, CLI block, container block) should reference
 * this section — not duplicate its content.
 */

import { isQmdAvailable } from './qmd';
import { resolveMemoryRoot } from './memory-manager';

export function getMemoryInstructions(): string {
  const root = resolveMemoryRoot();
  const hasSearch = isQmdAvailable();

  return [
    '\n\n## Memory System',
    '',
    `All memory files live in \`${root}\`. **Always use \`sero memory\`, \`sero memory_search\`, or \`sero scratchpad\` via \`sero-cli\`** — never read/write/grep managed files (\`MEMORY.md\`, \`IDENTITY.md\`, \`USER.md\`, \`SCRATCHPAD.md\`, \`memory/daily/\`, \`memory/sessions/\`) directly with bash, read, write, or edit tools. Direct access bypasses IDs, timestamps, capacity limits, duplicate detection, and search indexing.`,
    '',
    ...getMemoryRetrievalInstructions(hasSearch),
    '',
    ...getMemoryStorageInstructions(),
  ].join('\n');
}

/**
 * Retrieval instructions — when and how to search memory.
 */
function getMemoryRetrievalInstructions(hasSearch: boolean): string[] {
  const lines: string[] = [
    '### Retrieval',
    '',
    'For past conversations, decisions, preferences, or stored knowledge — use `sero memory_search`, not bash/grep/find.',
    '- `sero memory_search --query "X"` — ranked search across memory + transcripts (default `--scope all`)',
    '- `sero memory_search --query "X" --scope sessions` — search transcripts only',
    '- `sero memory_search --query "X" --scope memory` — search memory files only',
    '',
    'Start with ONE precise query. If it answers the question, stop. Only broaden if the first search misses.',
  ];

  if (hasSearch) {
    lines.push('Modes: `keyword` (default) → `semantic` → `deep`. Escalate only if needed.');
  } else {
    lines.push('If search indexing is unavailable, report that to the user — do NOT fall back to bash/read.');
  }

  lines.push(
    '',
    'To view full file contents: `sero memory read --target memory|identity|user|daily` (add `--with_ids true` before replace/remove).',
    'For quick text grep (no transcripts): `sero memory search --query "..."`.',
    'For scratchpad: `sero scratchpad list`.',
  );

  return lines;
}

/** Storage instructions — how to write/update memory. */
function getMemoryStorageInstructions(): string[] {
  return [
    '### Storage',
    '',
    '- `sero memory write --target memory|daily|user|identity --content "..." [--type fact|decision|preference|lesson|question|hypothesis] [--mode append|overwrite]`',
    '- `sero memory replace --target memory --entry_id "mem-..." --content "..."`',
    '- `sero memory remove --target memory --entry_id "mem-..."`',
    '- `sero memory consolidate [--schedule daily|weekly|off]`',
    '- `sero memory config [--snapshot frozen|live] [--auto_retrieve on|off]`',
    '- `sero scratchpad add|done "..."`',
    '',
    'Save durable facts, decisions, preferences, corrections → `memory`. Session progress, blockers → `daily`.',
    'Read with IDs before updating to avoid duplicates. Use type tags ([fact], [decision], [preference], etc.).',
    'Near capacity? Replace or remove stale entries instead of appending.',
  ];
}
