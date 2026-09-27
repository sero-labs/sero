/**
 * Memory instructions for the system prompt — what the tools are for and when
 * to save. The full save rule lives in the `memory` tool description, where
 * the agent reads it when it saves.
 *
 * This is the SINGLE SOURCE OF TRUTH for memory-related agent instructions.
 * Other prompt sources (AGENTS.md, CLI block, container block) should reference
 * this section — not duplicate its content.
 */

export function getMemoryInstructions(): string {
  return [
    '\n\n## Memory System',
    '',
    'Use `sero memory` to keep what a future session needs: save when the user corrects you, states a preference or makes a decision with a reason, and when you meet a surprise or a trap. Run `sero memory --help` for the save rule. Replace a memory that a new fact contradicts. Never edit memory files directly.',
    'Use `sero scratchpad` for open items in this workspace that carry over to the next session.',
    'Memories that match a message are added after it in a `memory-recall` message.',
  ].join('\n');
}
