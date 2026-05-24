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
    `All memory files live in \`${root}\`. **Always use \`sero memory\` or \`sero memory_search\` via \`sero-cli\`** — never read/write/grep managed files (\`MEMORY.md\`, \`IDENTITY.md\`, \`USER.md\`, \`memory/daily/\`, \`memory/sessions/\`) directly with bash, read, write, or edit tools. Direct access bypasses IDs, timestamps, capacity limits, duplicate detection, and search indexing.`,
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
    '**Conversation recall rule:** If the user asks what you remember, what you said/told them, what happened in another session, or asks about prior jokes/examples/advice, you MUST run `sero memory_search` before answering unless the answer is already present in the current visible transcript. Prefer `--scope sessions` for those requests.',
    'Start with ONE precise query. If it answers the question, stop. If it misses, retry with a shorter query that uses likely original wording (for example `joke` or `tell me a joke` rather than the meta-question `what jokes do you remember telling me`).',
  ];

  if (hasSearch) {
    lines.push('Modes: `keyword` (default) → `semantic` → `deep`. Escalate only if needed; use `semantic`/`deep` when wording may differ across sessions.');
  } else {
    lines.push('If search indexing is unavailable, report that to the user — do NOT fall back to bash/read.');
  }

  lines.push(
    '',
    'If `memory_search` returns no useful results after reasonable query/mode retries, say you searched memory and found nothing relevant. Do not pretend recall, and do not claim memory is unavailable without first using the tool.',
    'To view full file contents: `sero memory read --target memory|identity|user|daily` (add `--with_ids true` before replace/remove).',
    'For quick text grep (no transcripts): `sero memory search --query "..."`.',
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
    '',
    '**Where to put what** — pick the target that matches the lifespan:',
    '- `daily` — completed work / progress notes / blockers from *this* session that future-you will want to skim tomorrow. Written-once, append-only.',
    '- `memory` — durable cross-session knowledge: decisions that outlive the session, user preferences, project facts, lessons. Use type tags: [fact], [decision], [preference], [lesson], etc.',
    '',
    'Default routing: a summary of what you finished → `daily`. A choice you made that the next session should respect → `memory`.',
    'Read with IDs before updating `memory` to avoid duplicates. Near capacity? Replace or remove stale entries instead of appending.',
  ];
}
