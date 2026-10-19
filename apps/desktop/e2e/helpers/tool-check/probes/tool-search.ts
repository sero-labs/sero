import type { ToolProbe } from '../types';
import { expectText } from '../expect';

/**
 * Pi's `tool_search` loads a deferred tool for the session's next call. Only a
 * session with deferred tools is given it, so it runs where those are.
 */
export const toolSearchProbe: ToolProbe = {
  tool: 'tool_search',
  steps: [{
    action: null,
    params: { query: 'browser automation screenshot', limit: 3 },
    expect(result) {
      expectText(result, 'They are available from your next call:');
      if (!/^Loaded [1-9]\d* tools?\./.test(result.text)) throw new Error(`nothing was loaded: ${result.text}`);
    },
  }],
};
