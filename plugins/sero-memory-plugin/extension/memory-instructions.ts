/**
 * Memory system prompt instructions — added to the agent's system prompt on
 * every turn by the context injector's `before_agent_start` hook.
 *
 * This is the SINGLE SOURCE OF TRUTH for memory-related agent instructions.
 * Other prompt sources (AGENTS.md, CLI block, container block) should reference
 * this section — not duplicate its content.
 */

import { resolveMemoryRoot } from './memory-manager';

export function getMemoryInstructions(): string {
  const root = resolveMemoryRoot();

  return [
    '\n\n## Memory System',
    '',
    `Memory is three files in \`${root}\`, shown above under "Memory": \`IDENTITY.md\` (your persona), \`USER.md\` (the user's profile) and \`MEMORY.md\` (durable preferences, decisions and facts). Change them only with \`sero memory\` via \`sero-cli\` — never with bash, read, write, or edit tools.`,
    '',
    '- `sero memory read --target memory|identity|user` (add `--with_ids true` for MEMORY.md before replace/remove)',
    '- `sero memory write --target memory --content "..." [--type fact|decision|preference|lesson]`',
    '- `sero memory replace --target memory --entry_id "mem-..." --content "..."`',
    '- `sero memory remove --target memory --entry_id "mem-..."`',
    '',
    'Save to `MEMORY.md` only what the next session must respect: a stated preference, a decision, or a durable fact. Do not save progress notes or session summaries.',
    '',
    '**Update rule — never create contradictions:** if the user says change, update, switch, correct, remove, or turn off an existing memory, read the target first and modify the existing memory. Do not append a second conflicting line.',
    '- `USER.md` and `IDENTITY.md` are profile files. Update them by reading the file, keeping unchanged fields, then writing the complete revised file with `--mode overwrite`.',
    '- For profile fields, keep canonical lines like `- **Communication:** ...` and `- **Caveman Mode:** off|lite|full|ultra`. Do not append loose `Communication:` / `Rules:` paragraphs after existing fields.',
    '- For `MEMORY.md`, run `sero memory read --target memory --with_ids true`, then use `replace` or `remove` with the entry id. Append only genuinely new, non-conflicting memories.',
    '',
    'Changes take effect in the next session. Near capacity? Replace or remove stale entries instead of appending.',
  ].join('\n');
}
