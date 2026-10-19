import type { ToolProbe } from '../types';
import { expectText } from '../expect';
import { quoteArg } from '../command-line';

/** One argument with line breaks, both kinds of quote and non-ASCII text. */
const AWKWARD = 'tc-quoted line one\nline two with "double" and \'single\' quotes\nnon-ASCII: ü 日本 🙂';

export const seroCliProbe: ToolProbe = {
  tool: 'sero-cli',
  steps: [
    {
      action: null,
      // Two lines run as two commands, in order.
      params: { command: 'session info\nworkspace info' },
      expect(result) {
        expectText(result, 'Session ID:');
        expectText(result, 'Workspace: Tool Check');
      },
    },
    {
      action: null,
      // A line break inside quotes belongs to the argument, so the read shows the text whole.
      params: { command: `memory --action=write --target=user --content=${quoteArg(AWKWARD)}\nmemory --action=read --target=user` },
      expect: (result) => expectText(result, AWKWARD),
    },
  ],
};
