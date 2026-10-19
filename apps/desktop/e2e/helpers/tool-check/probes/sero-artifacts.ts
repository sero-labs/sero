import type { ToolProbe } from '../types';
import { expectText } from '../expect';

export const seroArtifactsProbe: ToolProbe = {
  tool: 'sero artifacts',
  steps: [
    {
      action: 'save',
      params: { argv: ['save', '--title', 'Tool check log', '--type', 'log', '--path', 'tool-check/log.txt'] },
      expect(result, ctx) {
        expectText(result, 'Artifact saved: Tool check log');
        ctx.state.artifactId = /\(([^)]+)\)\s*$/.exec(result.text.trim())?.[1];
        if (!ctx.state.artifactId) throw new Error(`no artifact id in: ${result.text}`);
      },
    },
    {
      action: 'list',
      params: { argv: ['list'] },
      expect: (result, ctx) => expectText(result, String(ctx.state.artifactId)),
    },
    {
      action: 'summary',
      params: { argv: ['summary'] },
      expect: (result) => expectText(result, 'Tool check log'),
    },
    {
      action: 'remove',
      params: (ctx) => ({ argv: ['remove', String(ctx.state.artifactId)] }),
      expect: (result, ctx) => expectText(result, `Removed artifact: ${String(ctx.state.artifactId)}`),
    },
  ],
};
