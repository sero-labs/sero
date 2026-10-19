import type { ToolProbe } from '../types';
import { expectText } from '../expect';

/** The first line of every command list. */
export const HEADING = 'Sero CLI — Platform commands for the Sero agent';

export const seroHelpProbe: ToolProbe = {
  tool: 'sero help',
  // The default for a command with no subcommands is no argument, which prints the list.
  failingCall: { argv: ['tc-no-such-command'] },
  steps: [
    { action: null, params: { argv: [] }, expect: (result) => expectText(result, 'workspace') },
    { action: null, params: { argv: ['git'] }, expect: (result) => expectText(result, 'checkpoint [message]') },
  ],
  // A Room member or a project's owner has only a few commands, so the site pass checks the heading every list starts with.
  siteStep: { action: null, params: { argv: [] }, expect: (result) => expectText(result, HEADING) },
};
