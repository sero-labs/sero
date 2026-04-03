import { describe, expect, it } from 'vitest';

import { CliRegistry } from '../../cli/core';
import { buildCliPromptBlock } from '../../cli';

describe('CLI prompt block', () => {
  it('includes memory routing rules when memory commands are registered', () => {
    const registry = new CliRegistry();
    const execute = async () => ({ output: 'ok', exitCode: 0 });

    registry.register({
      name: 'memory',
      summary: 'memory',
      group: 'Apps',
      source: 'app',
      execute,
    });
    registry.register({
      name: 'memory_search',
      summary: 'memory search',
      group: 'Apps',
      source: 'app',
      execute,
    });
    registry.register({
      name: 'scratchpad',
      summary: 'scratchpad',
      group: 'Apps',
      source: 'app',
      execute,
    });

    const prompt = buildCliPromptBlock(registry);

    expect(prompt).toContain('High-priority routing:');
    expect(prompt).toContain('Sero memory system files and history');
    expect(prompt).toContain('Start with one precise `sero memory_search` query');
    expect(prompt).toContain('Never use bash/read/write/edit');
  });
});
