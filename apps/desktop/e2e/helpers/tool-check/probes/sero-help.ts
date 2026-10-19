import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroHelpProbe: ToolProbe = {
  tool: 'sero help',
  steps: [
    { action: null, params: { argv: [] }, expect: (result) => expectText(result, 'workspace') },
    { action: null, params: { argv: ['git'] }, expect: (result) => expectText(result, 'checkpoint [message]') },
  ],
};
