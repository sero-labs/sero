import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroDevserverProbe: ToolProbe = {
  tool: 'sero devserver',
  steps: [
    {
      action: 'register',
      // The page server is already listening, so the registration has something real to point at.
      params: (ctx) => ({ argv: ['register', '--name', 'tool-check-pages', '--port', new URL(ctx.fixtures.pageServerUrl).port, '--command', 'node pages.js'] }),
      expect(result, ctx) {
        expectText(result, 'Registered tool-check-pages');
        ctx.state.serverId = /\(([^)]+)\)/.exec(result.text)?.[1];
        if (!ctx.state.serverId) throw new Error(`no server id: ${result.text}`);
      },
    },
    {
      action: 'list',
      params: { argv: ['list'] },
      expect: (result, ctx) => expectText(result, `${String(ctx.state.serverId)} `),
    },
    {
      action: 'stop',
      params: (ctx) => ({ argv: ['stop', String(ctx.state.serverId)] }),
      expect: (result, ctx) => expectText(result, `Stopped dev server: ${String(ctx.state.serverId)}`),
    },
    {
      action: 'list',
      params: { argv: ['list'] },
      expect(result, ctx) {
        if (result.text.includes(`${String(ctx.state.serverId)} [running]`)) throw new Error(`stopped server still running: ${result.text}`);
      },
    },
  ],
};
