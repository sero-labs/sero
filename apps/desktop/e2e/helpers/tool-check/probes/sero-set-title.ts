import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroSetTitleProbe: ToolProbe = {
  tool: 'sero set-title',
  steps: [
    {
      action: null,
      params: { argv: ['Tool check título'] },
      expect: (result) => expectText(result, 'Session titled: Tool check título'),
    },
    {
      // Only a session that now has a title refuses `--if-unnamed`.
      action: null,
      params: { argv: ['--if-unnamed', 'Another title'] },
      expect: (result) => expectText(result, 'Session already has a title'),
    },
  ],
};
