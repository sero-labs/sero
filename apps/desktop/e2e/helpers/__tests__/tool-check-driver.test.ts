import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { splitCommandLines, tokenizeCliInput } from '../../../electron/cli/core/parser';
import { startProbeStub, type ProbeStub } from '../session-probe';
import { cliCommandFor, quoteArg } from '../tool-check/command-line';
import { ScenarioDriver } from '../tool-check/driver';
import { LedgerWriter, ledgerProblems, type Ledger } from '../tool-check/ledger';
import type { StepContext, ToolProbe } from '../tool-check/types';

interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }

/** The tool calls in a streamed stub reply. */
function callsIn(body: string): ToolCall[] {
  return body.split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => (JSON.parse(line.slice(6)) as { choices: Array<{ delta: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> }).choices)
    .flatMap((choice) => choice.delta.tool_calls ?? [])
    .map((call) => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) as Record<string, unknown> }));
}

async function post(stub: ProbeStub, messages: unknown[]): Promise<string> {
  const response = await fetch(`${stub.server.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'stub-model', stream: true, messages, tools: [] }),
  });
  return response.text();
}

const user = { role: 'user', content: 'check notes' };
const answered = (call: ToolCall, text: string) => [
  { role: 'assistant', tool_calls: [{ id: call.id, function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] },
  { role: 'tool', tool_call_id: call.id, content: text },
];

describe('tool check scenario driver', () => {
  let stub: ProbeStub | undefined;
  let dir: string;

  afterEach(async () => {
    await stub?.server.close();
    stub = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function start(probe: ToolProbe, via: 'direct' | 'cli') {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-check-driver-'));
    const ledger = new LedgerWriter(path.join(dir, 'ledger-host.json'), 'host');
    const driver = new ScenarioDriver(ledger);
    stub = await startProbeStub({}, undefined, driver);
    const ctx: StepContext = { workspaceId: 'ws', workspacePath: dir, runtime: 'host', site: 'chat', fixtures: { pageServerUrl: '', gitRemotePath: '' }, state: {} };
    const outcome = driver.add({ prompt: 'check notes', tool: probe.tool, steps: probe.steps, via, ctx });
    return { ledger, outcome };
  }

  const notes: ToolProbe = {
    tool: 'notes',
    steps: [
      {
        action: 'add',
        params: { action: 'add', text: 'first line\nsecond' },
        expect(result, ctx) {
          ctx.state.id = /id=(\w+)/.exec(result.text)?.[1];
          if (!ctx.state.id) throw new Error('no id');
        },
      },
      {
        action: 'remove',
        params: (ctx) => ({ action: 'remove', id: ctx.state.id }),
        expect(result) {
          if (!result.text.includes('removed')) throw new Error(`not removed: ${result.text}`);
        },
      },
    ],
  };

  it('runs each step as its own turn and passes state from one step to the next', async () => {
    const { ledger, outcome } = await start(notes, 'direct');
    const [add] = callsIn(await post(stub!, [user]));
    expect(add).toMatchObject({ name: 'notes', arguments: { action: 'add', text: 'first line\nsecond' } });

    const [remove] = callsIn(await post(stub!, [user, ...answered(add!, 'added id=n1')]));
    expect(remove).toMatchObject({ name: 'notes', arguments: { action: 'remove', id: 'n1' } });

    await post(stub!, [user, ...answered(add!, 'added id=n1'), ...answered(remove!, 'removed n1')]);
    await expect(outcome).resolves.toEqual({ passed: 2 });
    expect(ledger.ledger.rows.map((row) => [row.action, row.result])).toEqual([['add', 'pass'], ['remove', 'pass']]);
  });

  it('stops at the first failed step and leaves the rest unrecorded', async () => {
    const { ledger, outcome } = await start(notes, 'direct');
    const [add] = callsIn(await post(stub!, [user]));
    const reply = await post(stub!, [user, ...answered(add!, 'ERROR: storage is read-only')]);

    expect(callsIn(reply)).toEqual([]);
    await expect(outcome).resolves.toMatchObject({ passed: 0, failure: expect.stringContaining('add: no id') });
    expect(ledger.ledger.rows).toEqual([expect.objectContaining({ action: 'add', result: 'fail', site: 'chat', runtime: 'host' })]);
  });

  it('runs a step through sero-cli as one command line', async () => {
    await start(notes, 'cli');
    const [add] = callsIn(await post(stub!, [user]));
    expect(add).toMatchObject({ name: 'sero-cli', arguments: { command: "notes --action='add' --text='first line\nsecond'" } });
  });
});

describe('sero-cli command lines', () => {
  it('keeps an argument with line breaks, quotes and non-ASCII text whole', () => {
    const value = `it's "quoted"\nline two \\ back\tslash — ünïcode 🙂`;
    const line = `notes ${quoteArg(value)}`;
    expect(splitCommandLines(line)).toEqual([line]);
    expect(tokenizeCliInput(line)).toEqual(['notes', value]);
  });

  it('passes a plugin tool parameter that starts with -- as a value', () => {
    const line = cliCommandFor('notes', { text: '--not-a-flag', tags: ['a', 'b'], count: 2 });
    expect(tokenizeCliInput(line)).toEqual(['notes', '--text=--not-a-flag', '--tags=["a","b"]', '--count=2']);
  });

  it('passes a core command argv token by token', () => {
    expect(tokenizeCliInput(cliCommandFor('sero git', { argv: ['checkpoint', 'two words'] })))
      .toEqual(['git', 'checkpoint', 'two words']);
  });

  it('passes argv to a plugin tool that parses its own command line', () => {
    expect(tokenizeCliInput(cliCommandFor('usage', { argv: ['summary', 'today'] }))).toEqual(['usage', 'summary', 'today']);
  });
});

describe('tool check ledger', () => {
  const probes: ToolProbe[] = [
    { tool: 'notes', steps: [{ action: 'add', params: {}, expect: () => undefined }, { action: 'remove', params: {}, expect: () => undefined }] },
    { tool: 'search', steps: [], exemptions: [{ action: null, reason: 'paid outside service', detail: 'Paid search API.' }] },
  ];

  function ledger(partial: Partial<Ledger>): Ledger {
    return { runtime: 'docker', planned: [], siteTools: {}, rows: [], ...partial };
  }

  it('names a non-exempt action missing from the ledger with its site and runtime', () => {
    const problems = ledgerProblems(ledger({
      planned: [{ tool: 'notes', action: 'add', site: 'chat' }, { tool: 'notes', action: 'remove', site: 'chat' }],
      rows: [{ runtime: 'docker', site: 'chat', tool: 'notes', action: 'add', result: 'pass', ms: 5 }],
    }), probes);
    expect(problems).toEqual(['not run: notes remove at chat on docker']);
  });

  it('names a failed action, and a tool a site was given that never ran there', () => {
    const problems = ledgerProblems(ledger({
      siteTools: { subagent: ['notes', 'search'] },
      rows: [
        { runtime: 'docker', site: 'chat', tool: 'notes', action: 'add', result: 'pass', ms: 5 },
        { runtime: 'docker', site: 'chat', tool: 'notes', action: 'remove', result: 'fail', ms: 5, error: 'still there' },
      ],
    }), probes);
    expect(problems).toEqual([
      'failed: notes remove at chat on docker: still there',
      'not run: notes at subagent on docker, which the site was given',
    ]);
  });

  it('fails an action whose session failed after its step passed', () => {
    const problems = ledgerProblems(ledger({
      rows: [
        { runtime: 'docker', site: 'chat', tool: 'notes', action: 'add', result: 'pass', ms: 5 },
        { runtime: 'docker', site: 'chat', tool: 'notes', action: 'remove', result: 'pass', ms: 5 },
        { runtime: 'docker', site: 'chat', tool: 'notes', action: 'remove', result: 'fail', ms: 0, error: 'the turn did not end' },
      ],
    }), probes);
    expect(problems).toEqual(['failed: notes remove at chat on docker: the turn did not end']);
  });
});
