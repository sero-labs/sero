import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroHelpProbe: ToolProbe = {
  tool: 'sero help',
  // The default for a command with no subcommands is no argument, which prints the list.
  failingCall: { argv: ['tc-no-such-command'] },
  steps: [
    { action: null, params: { argv: [] }, expect: (result) => expectText(result, 'workspace') },
    { action: null, params: { argv: ['git'] }, expect: (result) => expectText(result, 'checkpoint [message]') },
  ],
};
