import { describe, expect, it } from 'vitest';
import { Coordinator } from '../../runtime/coordinator';
import { createFakeHost } from '../../runtime/__tests__/fake-host';
import { buildAction, executeOrchestratorTool } from '../tools';
import { parseCommand } from '../commands';

describe('buildAction', () => {
  it('builds a create action with options', () => {
    const action = buildAction({ action: 'create', prompt: 'hi', activate: true, useManagedWorktree: false });
    expect(action).toEqual({
      kind: 'create',
      prompt: 'hi',
      title: undefined,
      options: { activate: true, workspace: { useManagedWorktree: false } },
    });
  });

  it('folds allowDirtyWorkspaceRoot into the create workspace options', () => {
    const action = buildAction({ action: 'create', prompt: 'hi', useManagedWorktree: false, allowDirtyWorkspaceRoot: true });
    expect(action).toEqual({
      kind: 'create',
      prompt: 'hi',
      title: undefined,
      options: { workspace: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true } },
    });
  });

  it('requires a loopId for lifecycle actions', () => {
    expect(buildAction({ action: 'activate' })).toEqual({ error: 'activate requires a loopId' });
  });

  it('builds a retry action from a loopId', () => {
    expect(buildAction({ action: 'retry', loopId: 'l1' })).toEqual({ kind: 'retry', loopId: 'l1' });
    expect(buildAction({ action: 'retry' })).toEqual({ error: 'retry requires a loopId' });
  });

  it('builds a delete action from a loopId', () => {
    expect(buildAction({ action: 'delete', loopId: 'l1' })).toEqual({ kind: 'delete', loopId: 'l1' });
  });

  it('builds a delete action that also deletes the branch', () => {
    expect(buildAction({ action: 'delete', loopId: 'l1', deleteBranch: true })).toEqual({
      kind: 'delete', loopId: 'l1', deleteBranch: true,
    });
  });

  it('parses a recovery decision from JSON', () => {
    const decision = { id: 'r1', stepId: 's1', failedAttemptId: 'a1', decision: 'retry-step', reason: 'x', createdAt: 'now' };
    const action = buildAction({ action: 'choose_recovery', loopId: 'l1', decisionJson: JSON.stringify(decision) });
    expect(action).toMatchObject({ kind: 'choose_recovery', loopId: 'l1', decision });
  });

  it('rejects malformed recovery JSON', () => {
    expect(buildAction({ action: 'choose_recovery', loopId: 'l1', decisionJson: '{bad' })).toEqual({
      error: 'decisionJson is not valid JSON',
    });
  });

  it('parses a loop context override from JSON', () => {
    const overrides = { systemPrompt: 'Be terse.', disabledTools: ['bash'] };
    const action = buildAction({ action: 'set_loop_context', loopId: 'l1', contextJson: JSON.stringify(overrides) });
    expect(action).toEqual({ kind: 'set_loop_context', loopId: 'l1', overrides });
  });

  it('parses a null override to clear the loop context', () => {
    expect(buildAction({ action: 'set_loop_context', loopId: 'l1', contextJson: 'null' })).toEqual({
      kind: 'set_loop_context', loopId: 'l1', overrides: null,
    });
  });

  it('rejects set_loop_context without contextJson', () => {
    expect(buildAction({ action: 'set_loop_context', loopId: 'l1' })).toEqual({
      error: 'set_loop_context requires contextJson',
    });
  });

  it('folds a delivery destination + params into the create options', () => {
    const action = buildAction({ action: 'create', prompt: 'hi', deliveryDestination: 'chat-post', deliveryParamsJson: '{"channel":"#intel"}' });
    expect(action).toEqual({
      kind: 'create',
      prompt: 'hi',
      title: undefined,
      options: { delivery: { destination: 'chat-post', params: { channel: '#intel' } } },
    });
  });

  it('builds set_delivery from destination + params', () => {
    expect(buildAction({ action: 'set_delivery', loopId: 'l1', deliveryDestination: 'saved-artifact' })).toEqual({
      kind: 'set_delivery', loopId: 'l1', delivery: { destination: 'saved-artifact', params: undefined },
    });
    expect(buildAction({ action: 'set_delivery', loopId: 'l1' })).toEqual({
      error: 'set_delivery requires a deliveryDestination',
    });
    expect(buildAction({ action: 'set_delivery', deliveryDestination: 'pr' })).toEqual({
      error: 'set_delivery requires a loopId',
    });
  });

  it('builds set_schedule from triggerId + schedule/scheduleDisabled', () => {
    expect(buildAction({ action: 'set_schedule', loopId: 'l1', triggerId: 't1', schedule: '0 9 * * *' })).toEqual({
      kind: 'set_schedule', loopId: 'l1', triggerId: 't1', schedule: '0 9 * * *', disabled: undefined,
    });
    expect(buildAction({ action: 'set_schedule', loopId: 'l1', triggerId: 't1', scheduleDisabled: true })).toEqual({
      kind: 'set_schedule', loopId: 'l1', triggerId: 't1', schedule: undefined, disabled: true,
    });
    expect(buildAction({ action: 'set_schedule', triggerId: 't1', schedule: '0 9 * * *' })).toEqual({
      error: 'set_schedule requires a loopId',
    });
    expect(buildAction({ action: 'set_schedule', loopId: 'l1', schedule: '0 9 * * *' })).toEqual({
      error: 'set_schedule requires a triggerId',
    });
    expect(buildAction({ action: 'set_schedule', loopId: 'l1', triggerId: 't1' })).toEqual({
      error: 'set_schedule requires a schedule and/or scheduleDisabled',
    });
  });

  it('rejects malformed delivery params', () => {
    expect(buildAction({ action: 'set_delivery', loopId: 'l1', deliveryDestination: 'webhook-post', deliveryParamsJson: '{bad' })).toEqual({
      error: 'deliveryParamsJson is not valid JSON',
    });
    expect(buildAction({ action: 'set_delivery', loopId: 'l1', deliveryDestination: 'webhook-post', deliveryParamsJson: '["url"]' })).toEqual({
      error: 'deliveryParamsJson must be a JSON object of destination params',
    });
  });

  it('parses a set_step_tools allowlist from JSON', () => {
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1', stepId: 's1', toolsJson: '["bash","web_search"]' })).toEqual({
      kind: 'set_step_tools', loopId: 'l1', stepId: 's1', tools: ['bash', 'web_search'],
    });
  });

  it('parses a null/omitted set_step_tools as a revert to baseline', () => {
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1', stepId: 's1', toolsJson: 'null' })).toEqual({
      kind: 'set_step_tools', loopId: 'l1', stepId: 's1', tools: undefined,
    });
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1', stepId: 's1' })).toEqual({
      kind: 'set_step_tools', loopId: 'l1', stepId: 's1', tools: undefined,
    });
  });

  it('rejects a set_step_tools payload that is not a string array', () => {
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1', stepId: 's1', toolsJson: '[1,2]' })).toEqual({
      error: 'toolsJson must be a JSON array of tool-name strings, or "null"',
    });
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1', stepId: 's1' as string })).toBeDefined();
    expect(buildAction({ action: 'set_step_tools', loopId: 'l1' })).toEqual({
      error: 'set_step_tools requires a stepId',
    });
  });
});

describe('executeOrchestratorTool', () => {
  it('returns a clear error when no coordinator is loaded for the cwd', async () => {
    const res = await executeOrchestratorTool({ action: 'list' }, '/unknown', () => undefined);
    expect(res.details.ok).toBe(false);
    expect(res.text).toContain('runtime is not loaded');
  });

  it('requires a cwd', async () => {
    const res = await executeOrchestratorTool({ action: 'list' }, undefined);
    expect(res.details.ok).toBe(false);
  });

  it('routes through the resolved coordinator', async () => {
    const coordinator = new Coordinator(createFakeHost());
    const res = await executeOrchestratorTool(
      { action: 'create', prompt: 'do it' },
      '/workspaces/ws-1',
      () => coordinator,
    );
    expect(res.details.ok).toBe(true);
    expect(res.text).toContain('Created loop');
  });
});

describe('parseCommand', () => {
  it('parses create with a multi-word prompt', () => {
    expect(parseCommand('create build the thing')).toEqual({ action: 'create', prompt: 'build the thing' });
  });

  it('parses lifecycle actions with a loopId', () => {
    expect(parseCommand('activate loop_0001')).toEqual({ action: 'activate', loopId: 'loop_0001' });
  });

  it('parses a create --deliver flag ahead of the prompt', () => {
    expect(parseCommand('create --deliver chat-post post a digest every morning')).toEqual({
      action: 'create', prompt: 'post a digest every morning', deliveryDestination: 'chat-post',
    });
    expect(parseCommand('create --deliver carrier-pigeon do it')).toMatchObject({ error: expect.stringContaining('carrier-pigeon') });
  });

  it('parses set_delivery with a loopId and destination', () => {
    expect(parseCommand('set_delivery loop_0001 saved-artifact')).toEqual({
      action: 'set_delivery', loopId: 'loop_0001', deliveryDestination: 'saved-artifact',
    });
    expect(parseCommand('set_delivery loop_0001 nope')).toMatchObject({ error: expect.stringContaining('nope') });
    expect(parseCommand('set_delivery loop_0001')).toMatchObject({ error: expect.stringContaining('set_delivery') });
  });

  it('returns help on unknown action', () => {
    const res = parseCommand('frobnicate');
    expect('error' in res).toBe(true);
  });
});
