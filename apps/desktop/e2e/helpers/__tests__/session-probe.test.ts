import { afterEach, describe, expect, it } from 'vitest';

import { classifyResult, cliCommandsListed, startProbeStub, type ProbeStub } from '../session-probe';

const CLI_BLOCK = `

## Sero CLI

Use \`sero-cli\` for Sero platform actions.

Apps:
  design_library_items — Search visual references
  totally_new_command — Something added later

Builtin:
  workspace — Manage workspaces

## Subagents
  not_a_command — outside the block
`;

async function post(stub: ProbeStub, messages: unknown[], tools: unknown[]): Promise<string> {
  const response = await fetch(`${stub.server.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'stub-model', stream: true, messages, tools }),
  });
  return response.text();
}

describe('session probe', () => {
  let stub: ProbeStub | undefined;

  afterEach(async () => {
    await stub?.server.close();
    stub = undefined;
  });

  it('reads the commands from the Sero CLI block only', () => {
    expect(cliCommandsListed(CLI_BLOCK)).toEqual(['design_library_items', 'totally_new_command', 'workspace']);
  });

  it('tells a missing tool or command from a result that ran', () => {
    expect(classifyResult('Tool goal_complete not found')).toBe('unknown-tool');
    expect(classifyResult('ERROR: Unknown command: goal')).toBe('unknown-command');
    expect(classifyResult('ERROR: This command requires an active agent session.')).toBe('no-session');
    expect(classifyResult('No registered dev servers.')).toBe('callable');
  });

  it('fails a session that shows a command with no probe, and names it', async () => {
    stub = await startProbeStub();
    const tools = [{ type: 'function', function: { name: 'sero-cli', description: 'cli', parameters: {} } }];
    const messages = [{ role: 'system', content: CLI_BLOCK }, { role: 'user', content: 'probe' }];

    await post(stub, messages, tools);
    await post(stub, [
      ...messages,
      { role: 'assistant', tool_calls: [{ id: 'probe-cli-workspace', function: { name: 'sero-cli', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'probe-cli-workspace', content: 'Workspaces: one' },
    ], tools);

    const session = stub.sessions.get('probe');
    expect(session?.outcomes.filter((outcome) => outcome.kind === 'no-probe').map((outcome) => outcome.label))
      .toEqual(['sero-cli: totally_new_command']);
    expect(session?.outcomes.find((outcome) => outcome.label === 'sero-cli: workspace')?.kind).toBe('callable');
  });

  it('fails a call that got no result, even when another call did', async () => {
    stub = await startProbeStub();
    const tools = [{ type: 'function', function: { name: 'sero-cli', description: 'cli', parameters: {} } }];
    const messages = [{ role: 'system', content: CLI_BLOCK }, { role: 'user', content: 'probe' }];

    await post(stub, messages, tools);
    await post(stub, [
      ...messages,
      { role: 'tool', tool_call_id: 'probe-cli-workspace', content: 'Workspaces: one' },
    ], tools);

    const outcomes = stub.sessions.get('probe')?.outcomes ?? [];
    expect(outcomes.find((outcome) => outcome.label === 'sero-cli: design_library_items')?.kind).toBe('no-result');
  });

  it('fails a write whose file the shell cannot read back', async () => {
    stub = await startProbeStub();
    const tools = ['write', 'bash'].map((name) => ({ type: 'function', function: { name, description: name, parameters: {} } }));
    const messages = [{ role: 'user', content: 'probe' }];

    await post(stub, messages, tools);
    const withResults = [
      ...messages,
      { role: 'tool', tool_call_id: 'probe-tool-write', content: 'Wrote 23 bytes' },
      { role: 'tool', tool_call_id: 'probe-tool-bash', content: 'probe' },
    ];
    await post(stub, withResults, tools);
    await post(stub, [
      ...withResults,
      { role: 'tool', tool_call_id: 'probe-read-back', content: 'cat: probe-write.txt: No such file or directory' },
    ], tools);

    const outcomes = stub.sessions.get('probe')?.outcomes ?? [];
    expect(outcomes.find((outcome) => outcome.label === 'write then bash')?.kind).toBe('unseen-write');
  });

  it('fails a call with valid arguments that returns an error', async () => {
    stub = await startProbeStub();
    const tools = [{ type: 'function', function: { name: 'find', description: 'find', parameters: {} } }];
    const messages = [{ role: 'user', content: 'probe' }];

    await post(stub, messages, tools);
    await post(stub, [...messages, { role: 'tool', tool_call_id: 'probe-tool-find', content: 'Error: search index is missing' }], tools);

    expect(stub.sessions.get('probe')?.outcomes[0]?.kind).toBe('unexpected-error');
  });
});
