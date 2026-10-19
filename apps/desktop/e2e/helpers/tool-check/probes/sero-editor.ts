import type { ToolProbe } from '../types';
import { expectText } from '../expect';
import { putFile } from '../files';

export const seroEditorProbe: ToolProbe = {
  tool: 'sero editor',
  steps: [
    {
      action: 'read',
      setup: (ctx) => putFile(ctx, 'tool-check/editor.txt', 'editor contents ü\n'),
      params: { argv: ['read', 'tool-check/editor.txt'] },
      expect: (result) => expectText(result, 'editor contents ü'),
    },
    {
      action: 'list',
      params: { argv: ['list', 'tool-check'] },
      expect: (result) => expectText(result, 'editor.txt'),
    },
  ],
};
