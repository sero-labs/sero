import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroCliProbe: ToolProbe = {
  tool: 'sero-cli',
  steps: [{
    action: null,
    // Two lines run as two commands, in order.
    params: { command: 'session info\nworkspace info' },
    expect(result) {
      expectText(result, 'Session ID:');
      expectText(result, 'Workspace: Tool Check');
    },
  }],
};
