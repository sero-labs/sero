import { describe, expect, it } from 'vitest';
import { actionToParams } from '../lib/action-params';

describe('actionToParams', () => {
  it('maps set_delivery payloads (regression: the dialog dispatched a payload the tool never received)', () => {
    expect(
      actionToParams({ kind: 'set_delivery', loopId: 'l1', delivery: { destination: 'chat-post', params: { channel: '#x' } } }),
    ).toEqual({
      action: 'set_delivery',
      loopId: 'l1',
      deliveryDestination: 'chat-post',
      deliveryParamsJson: '{"channel":"#x"}',
    });
    expect(actionToParams({ kind: 'set_delivery', loopId: 'l1', delivery: { destination: 'pr' } })).toEqual({
      action: 'set_delivery',
      loopId: 'l1',
      deliveryDestination: 'pr',
    });
  });

  it('maps set_step_agent (regression: a picked agent silently reverted to the default)', () => {
    expect(actionToParams({ kind: 'set_step_agent', loopId: 'l1', stepId: 's1', agent: 'reviewer' })).toEqual({
      action: 'set_step_agent',
      loopId: 'l1',
      stepId: 's1',
      agent: 'reviewer',
    });
    // Reverting really does omit the agent param.
    expect(actionToParams({ kind: 'set_step_agent', loopId: 'l1', stepId: 's1', agent: undefined })).toEqual({
      action: 'set_step_agent',
      loopId: 'l1',
      stepId: 's1',
    });
  });

  it('maps the catalog actions', () => {
    expect(actionToParams({ kind: 'catalog_install', repoKey: 'official', slug: 'ci-fixer' })).toEqual({
      action: 'catalog_install',
      repoKey: 'official',
      slug: 'ci-fixer',
    });
    expect(actionToParams({ kind: 'catalog_add_repo', url: 'https://x.git' })).toEqual({
      action: 'catalog_add_repo',
      url: 'https://x.git',
    });
    expect(actionToParams({ kind: 'catalog_refresh' })).toEqual({ action: 'catalog_refresh' });
  });

  it('keeps the established mappings intact', () => {
    expect(actionToParams({ kind: 'set_step_tools', loopId: 'l1', stepId: 's1', tools: ['web_search'] })).toEqual({
      action: 'set_step_tools',
      loopId: 'l1',
      stepId: 's1',
      toolsJson: '["web_search"]',
    });
    expect(actionToParams({ kind: 'answer_input', loopId: 'l1', requestId: 'r1', answers: [{ questionId: 'q1', text: 'hi' }] })).toEqual({
      action: 'answer_input',
      loopId: 'l1',
      requestId: 'r1',
      answersJson: '[{"questionId":"q1","text":"hi"}]',
    });
    expect(actionToParams({ kind: 'run_next', loopId: 'l1' })).toEqual({ action: 'run_next', loopId: 'l1' });
  });
});
