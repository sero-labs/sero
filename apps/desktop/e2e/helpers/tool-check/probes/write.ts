import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ToolProbe } from '../types';
import { expectOk } from '../expect';

export const writeProbe: ToolProbe = {
  tool: 'write',
  steps: [
    {
      action: null,
      params: { path: 'tool-check/write.txt', content: 'line one\nlíne twö\n' },
      async expect(result, ctx) {
        expectOk(result);
        const written = await readFile(path.join(ctx.workspacePath, 'tool-check/write.txt'), 'utf8');
        if (written !== 'line one\nlíne twö\n') throw new Error(`write left ${JSON.stringify(written)}`);
      },
    },
  ],
};
