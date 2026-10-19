import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroSessionProbe: ToolProbe = {
  tool: 'sero session',
  steps: [{ action: 'info', params: { argv: ['info'] }, expect: (result) => expectText(result, 'Session ID:') }],
};
