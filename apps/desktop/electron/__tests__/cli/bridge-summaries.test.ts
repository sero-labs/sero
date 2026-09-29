import { describe, expect, it } from 'vitest';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { bridgeTool, summarizeDescription } from '@electron/cli/core/schema-bridge';

describe('command summaries', () => {
  it('ends at a word boundary within 100 characters', () => {
    const description = 'brief, charter, milestone, decide, research, plan, review, ship, archive and reopen every kind of planning document. More text.';
    const summary = summarizeDescription(description, 'fallback');
    expect(summary.length).toBeLessThanOrEqual(100);
    expect(description.startsWith(`${summary} `)).toBe(true);
  });

  it('keeps a short first sentence whole', () => {
    expect(summarizeDescription('Read and update settings. Second sentence.', 'x')).toBe('Read and update settings');
  });

  it('uses a summary declared on the tool without a custom execute', () => {
    const tool = defineTool({
      name: 'moved_tool',
      label: 'Moved',
      description: 'Internal surface. Reserve this for setup work.',
      parameters: Type.Object({ action: Type.String() }),
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: {} }),
    });
    tool.cli = { summary: 'Add or remove servers' };
    expect(bridgeTool('moved_tool', tool).summary).toBe('Add or remove servers');
  });
});

describe('bridged JSON parameters', () => {
  it('passes object and untyped parameters to the tool as parsed JSON', async () => {
    let received: Record<string, unknown> | undefined;
    const tool = defineTool({
      name: 'json_tool',
      label: 'Json',
      description: 'Takes JSON.',
      parameters: Type.Object({
        toolArguments: Type.Optional(Type.Record(Type.String(), Type.Any())),
        view: Type.Optional(Type.Unknown()),
      }),
      execute: async (_id, params) => {
        received = params;
        return { content: [{ type: 'text', text: 'ok' }], details: {} };
      },
    });

    const command = bridgeTool('json_tool', tool);
    const result = await command.execute(
      ['--toolArguments', '{"repo":"sero"}', '--view', '{"scope":"all"}'],
      { workspaceId: 'ws', sessionId: null, cwd: process.cwd(), invocation: { signal: undefined } } as never,
    );

    expect(result.exitCode).toBe(0);
    expect(received).toEqual({ toolArguments: { repo: 'sero' }, view: { scope: 'all' } });
  });

  it('rejects arguments that do not match the tool schema before execution', async () => {
    let called = false;
    const tool = defineTool({
      name: 'schema_strict_tool',
      label: 'Strict',
      description: 'Takes an array of questions.',
      parameters: Type.Object({ questions: Type.Array(Type.String()) }),
      execute: async () => {
        called = true;
        return { content: [{ type: 'text', text: 'ok' }], details: {} };
      },
    });

    const command = bridgeTool('schema_strict_tool', tool);
    const result = await command.execute(
      ['{"questions":"not-an-array"}'],
      { workspaceId: 'ws', sessionId: null, cwd: process.cwd(), invocation: { signal: undefined } } as never,
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Invalid arguments for schema_strict_tool');
    expect(called).toBe(false);
  });
});
