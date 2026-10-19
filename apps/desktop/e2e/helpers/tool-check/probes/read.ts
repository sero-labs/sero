import type { ToolProbe } from '../types';
import { expectOk } from '../expect';
import { putFile } from '../files';

export const readProbe: ToolProbe = {
  tool: 'read',
  steps: [
    {
      action: null,
      setup: (ctx) => putFile(ctx, 'tool-check/read.txt', 'first\nsecond\nthird\n'),
      params: { path: 'tool-check/read.txt' },
      expect(result) {
        expectOk(result);
        for (const line of ['first', 'second', 'third']) {
          if (!result.text.includes(line)) throw new Error(`read is missing ${line}: ${result.text}`);
        }
      },
    },
    {
      action: null,
      params: { path: 'tool-check/read.txt', offset: 2, limit: 1 },
      expect(result) {
        expectOk(result);
        if (!result.text.includes('second') || result.text.includes('first') || result.text.includes('third')) {
          throw new Error(`offset 2, limit 1 should give only "second": ${result.text}`);
        }
      },
    },
  ],
};
