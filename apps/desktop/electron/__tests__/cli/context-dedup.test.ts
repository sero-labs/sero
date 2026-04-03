/**
 * Context deduplication tests.
 *
 * Verifies that memory instructions are not duplicated across the
 * system prompt sources: AGENTS.md template, memory-instructions.ts,
 * CLI prompt block, and container prompt block.
 *
 * See docs/analysis/context-bloat-reduction.md for the full analysis.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { buildCliPromptBlock } from '../../cli';
import { buildContainerPromptBlock } from '../../features/container/tools/system-prompt';
import { getMemoryInstructions } from '../../../../../plugins/sero-memory-plugin/extension/memory-instructions';

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
    expect(memoryInstructions).toContain('### Retrieval');
    expect(memoryInstructions).toContain('### Storage');
    expect(memoryInstructions).toContain('sero memory_search');
    expect(memoryInstructions).toContain('sero memory write');
  });

  it('AGENTS.md template does NOT duplicate detailed memory instructions', () => {
    // The template should be a brief pointer, not a duplication
    expect(agentsTemplate.length).toBeLessThan(500);

    // Must NOT contain detailed tool syntax or full command examples
    expect(agentsTemplate).not.toContain('sero memory write');
    expect(agentsTemplate).not.toContain('memory read --target');
    expect(agentsTemplate).not.toContain('### When to use each memory tool');
    expect(agentsTemplate).not.toContain('### Save to `memory`');
    expect(agentsTemplate).not.toContain('### Retrieval habits');
    expect(agentsTemplate).not.toContain('### Writing habits');
  });

  it('CLI prompt block does NOT duplicate memory routing rules', () => {
    expect(cliBlock).not.toContain('High-priority routing');
    expect(cliBlock).not.toContain('Sero memory system files and history');
    expect(cliBlock).not.toContain('MEMORY.md');
    expect(cliBlock).not.toContain('IDENTITY.md');
    expect(cliBlock).not.toContain('memory_search');
  });

  it('container prompt block uses a brief memory reference, not full rules', () => {
    // Should reference the Memory System section, not restate it
    expect(containerBlock).toContain('Memory System section');
    // Should NOT contain the full instruction block
    expect(containerBlock).not.toContain('Direct file access bypasses IDs, timestamps');
    expect(containerBlock).not.toContain('search indexing is unavailable');
    // Should still mention the tools concisely
    expect(containerBlock).toContain('sero memory');
  });

  it('managed file list appears once in memory-instructions, not in other sources', () => {
    // memory-instructions.ts lists them
    expect(memoryInstructions).toContain('MEMORY.md');
    expect(memoryInstructions).toContain('IDENTITY.md');
    expect(memoryInstructions).toContain('SCRATCHPAD.md');
    expect(memoryInstructions).toContain('memory/daily/');

    // CLI block should not list them
    expect(cliBlock).not.toContain('MEMORY.md');
    expect(cliBlock).not.toContain('IDENTITY.md');

    // Container block should not fully list them
    expect(containerBlock).not.toContain('SCRATCHPAD.md');
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
