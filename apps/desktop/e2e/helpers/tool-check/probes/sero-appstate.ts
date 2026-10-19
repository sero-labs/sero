import path from 'node:path';
import type { ToolProbe } from '../types';
import { expectText } from '../expect';
import { fileText } from '../files';

const STATE_FILE = '.sero/apps/tool-check/state.json';

export const seroAppstateProbe: ToolProbe = {
  tool: 'sero appstate',
  steps: [
    {
      action: 'write',
      params: (ctx) => ({ argv: ['write', path.join(ctx.workspacePath, STATE_FILE), '--json', '{"count":2,"name":"tool check ü"}'] }),
      async expect(result, ctx) {
        expectText(result, 'Wrote app state');
        const written = JSON.parse((await fileText(ctx, STATE_FILE)) ?? 'null') as unknown;
        if (JSON.stringify(written) !== JSON.stringify({ count: 2, name: 'tool check ü' })) {
          throw new Error(`state file holds ${JSON.stringify(written)}`);
        }
      },
    },
    {
      action: 'read',
      params: (ctx) => ({ argv: ['read', path.join(ctx.workspacePath, STATE_FILE)] }),
      expect: (result) => expectText(result, '"name": "tool check ü"'),
    },
  ],
};
