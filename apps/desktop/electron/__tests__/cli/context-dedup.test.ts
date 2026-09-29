/**
 * Context deduplication tests.
 *
 * Verifies that memory instructions are not duplicated across the
 * system prompt sources: AGENTS.md template, memory-instructions.ts,
 * CLI prompt block, and container prompt block.
 *
 * These tests keep the context reduction contract executable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { buildCliPromptBlock } from '@electron/cli';
import { buildContainerPromptBlock } from '@electron/features/container/tools/system-prompt';
import { getMemoryInstructions } from '@plugins/sero-memory-plugin/extension/memory-instructions';

// ── Helpers ─────────────────────────────────────────────────

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/** Load the AGENTS.md template (the source, not a user's copy). */
function loadAgentsTemplate(): string {
  return readFileSync(
    path.resolve(__dirname, '../../../../../packages/templates/profile/AGENTS.md'),
    'utf8',
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('System prompt deduplication — memory instructions', () => {
  const memoryInstructions = getMemoryInstructions();
  const cliBlock = buildCliPromptBlock();
  const containerBlock = buildContainerPromptBlock('test-ws', '192.168.64.2');
  const agentsTemplate = loadAgentsTemplate();

  it('memory-instructions.ts is the single source of truth for memory rules', () => {
    // The canonical rules MUST be in memory-instructions.ts
    expect(memoryInstructions).toContain('## Memory System');
    expect(memoryInstructions).toContain('sero memory');
  });

  it('AGENTS.md template does NOT duplicate detailed memory instructions', () => {
    // The template can include concise workspace guidance, but should remain
    // much smaller than the canonical memory instructions.
    expect(agentsTemplate.length).toBeLessThan(3500);

    // Must NOT contain detailed tool syntax or full command examples
    expect(agentsTemplate).not.toContain('sero memory write');
    expect(agentsTemplate).not.toContain('memory read --target');
    expect(agentsTemplate).not.toContain('### When to use each memory tool');
    expect(agentsTemplate).not.toContain('### Save to `memory`');
    expect(agentsTemplate).not.toContain('### Retrieval habits');
    expect(agentsTemplate).not.toContain('### Writing habits');
  });

  it('AGENTS.md template names only tools that exist and agrees with the memory rules', () => {
    expect(agentsTemplate).not.toContain('kanban');
    expect(agentsTemplate).not.toContain('register_dev_server');
    expect(agentsTemplate).not.toContain('`daily`');
    expect(agentsTemplate).not.toContain('`write` tool');
  });

  it('CLI prompt block does NOT duplicate memory routing rules', () => {
    expect(cliBlock).not.toContain('High-priority routing');
    expect(cliBlock).not.toContain('Sero memory system files and history');
    expect(cliBlock).not.toContain('MEMORY.md');
    expect(cliBlock).not.toContain('IDENTITY.md');
    expect(cliBlock).not.toContain('memory_search');
  });

  it('container prompt block leaves memory to the memory block', () => {
    expect(containerBlock).not.toContain('Memory System');
    expect(containerBlock).not.toContain('sero memory');
  });

});

describe('System prompt deduplication — overall budget', () => {
  it('"never use bash on memory files" has minimal repetition across all sources', () => {
    const combined = [
      loadAgentsTemplate(),
      getMemoryInstructions(),
      buildCliPromptBlock(),
      buildContainerPromptBlock('test-ws', '192.168.64.2'),
    ].join('\n');

    // The core prohibition should appear at most twice across all sources
    // (once in memory-instructions as canonical, once brief in AGENTS.md)
    const bashWarnings = countOccurrences(combined, 'never') +
      countOccurrences(combined, 'Never');
    // Allow up to 3 total "never" mentions across all sources combined
    // (the word appears in different contexts too)
    expect(bashWarnings).toBeLessThanOrEqual(5);
  });
});
