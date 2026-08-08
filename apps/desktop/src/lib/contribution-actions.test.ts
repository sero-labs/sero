// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeContributionAction } from './contribution-actions';

describe('executeContributionAction', () => {
  const invokeTool = vi.fn();

  beforeEach(() => {
    invokeTool.mockReset();
    (window as unknown as { sero: { appAgent: { invokeTool: typeof invokeTool } } }).sero = {
      appAgent: { invokeTool },
    };
  });

  it('invokes only the owning app tool and gives host context precedence', async () => {
    invokeTool.mockResolvedValue({ content: [] });

    const result = await executeContributionAction(
      'graphify',
      'workspace-1',
      {
        type: 'tool',
        tool: 'graphify_index',
        params: { workspaceId: 'manifest-value', action: 'enable' },
      },
      {
        workspaceId: 'workspace-1',
        workspaceName: 'My workspace',
        workspacePath: '/workspaces/my-workspace',
      },
    );

    expect(result.ok).toBe(true);
    expect(invokeTool).toHaveBeenCalledWith('graphify', 'workspace-1', 'graphify_index', {
      action: 'enable',
      workspaceId: 'workspace-1',
      workspaceName: 'My workspace',
      workspacePath: '/workspaces/my-workspace',
    });
  });

  it('returns a structured failure instead of throwing', async () => {
    invokeTool.mockRejectedValue(new Error('tool failed'));

    const result = await executeContributionAction(
      'graphify',
      'workspace-1',
      { type: 'tool', tool: 'graphify_index' },
      {
        workspaceId: 'workspace-1',
        workspaceName: 'My workspace',
        workspacePath: '/workspaces/my-workspace',
      },
    );

    expect(result).toMatchObject({ ok: false, error: expect.any(Error) });
  });
});
