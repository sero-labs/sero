import type { ToolProbe } from '../types';
import { expectOk } from '../expect';
import { expectFile } from '../files';

const CONTENT = 'line one\nlíne twö "quoted"\n';

export const writeProbe: ToolProbe = {
  tool: 'write',
  steps: [{
    action: null,
    params: { path: 'tool-check/write.txt', content: CONTENT },
    async expect(result, ctx) {
      expectOk(result);
      await expectFile(ctx, 'tool-check/write.txt', CONTENT);
    },
  }],
};
