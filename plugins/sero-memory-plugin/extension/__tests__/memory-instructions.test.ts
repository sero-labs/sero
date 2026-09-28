import { describe, expect, it } from 'vitest';

import { getMemoryInstructions } from '../memory-instructions';

describe('memory instructions', () => {
  it('tells agents to update existing memories instead of appending contradictions', () => {
    const instructions = getMemoryInstructions();

    expect(instructions).toContain('never create contradictions');
    expect(instructions).toContain('USER.md` and `IDENTITY.md` are profile files');
    expect(instructions).toContain('writing the complete revised file with `--mode overwrite`');
    expect(instructions).toContain('read --target memory --with_ids true');
    expect(instructions).toContain('daily` is the only append-only target');
  });
});
