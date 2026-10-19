import type { ToolProbe } from '../types';
import { expectOk } from '../expect';
import { expectFile, putFile } from '../files';

export const editProbe: ToolProbe = {
  tool: 'edit',
  steps: [{
    action: null,
    setup: (ctx) => putFile(ctx, 'tool-check/edit.txt', 'alpha\nbeta\ngamma\n'),
    params: { path: 'tool-check/edit.txt', edits: [{ oldText: 'beta', newText: 'béta two' }, { oldText: 'gamma', newText: 'delta' }] },
    async expect(result, ctx) {
      expectOk(result);
      await expectFile(ctx, 'tool-check/edit.txt', 'alpha\nbéta two\ndelta\n');
    },
  }],
};
