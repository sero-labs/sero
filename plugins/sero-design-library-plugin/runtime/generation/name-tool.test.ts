import { describe, expect, it } from 'vitest';

import { invokeTool } from '../librarian/test-support';
import { MAX_NAME_CHARS, createNameDesignTool } from './name-tool';

/**
 * The name is what the variant is called everywhere the user looks, so it has to
 * come from a tool call rather than out of the reply text. These are about the
 * two facts the rest of the pipeline depends on: nothing is named until the tool
 * has been called, and what it stores fits on a tab.
 */

describe('naming a design', () => {
  it('has no naming until the tool is called', async () => {
    const tool = createNameDesignTool();

    expect(tool.naming()).toBeNull();

    await invokeTool(tool.definition, { name: 'Signal ledger', summary: 'A typography-led panel.' });

    expect(tool.naming()).toEqual({ name: 'Signal ledger', summary: 'A typography-led panel.' });
  });

  it('cuts a name down to a tab label', async () => {
    const tool = createNameDesignTool();

    await invokeTool(tool.definition, {
      name: 'An extremely long name that reads like a sentence rather than a label',
      summary: 'x',
    });

    expect(tool.naming()?.name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  it('refuses an empty name rather than storing one', async () => {
    const tool = createNameDesignTool();

    const result = await invokeTool(tool.definition, { name: '   ', summary: 'x' });

    expect(result.details).toEqual({ ok: false });
    expect(tool.naming()).toBeNull();
  });

  it('keeps the last name when the run names itself twice', async () => {
    const tool = createNameDesignTool();

    await invokeTool(tool.definition, { name: 'First idea', summary: 'a' });
    await invokeTool(tool.definition, { name: 'Second idea', summary: 'b' });

    expect(tool.naming()?.name).toBe('Second idea');
  });
});
