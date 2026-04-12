import { describe, expect, it } from 'vitest';

import {
  describeGatewayScope,
  humanizeGatewayRequestError,
} from '@/lib/gateway-errors';

describe('gateway error helpers', () => {
  it('describes a single-workspace pairing scope clearly', () => {
    expect(
      describeGatewayScope([
        { id: 'workspace-a', name: 'Workspace A' },
      ], 'workspace-a'),
    ).toEqual({
      title: 'Device access: Workspace A',
      detail: 'This paired device can only access this workspace.',
      shortLabel: 'Workspace A',
    });
  });

  it('humanizes unauthorized workspace errors with scope guidance', () => {
    const result = humanizeGatewayRequestError(
      {
        requestType: 'list_sessions',
        message: 'Workspace not authorized: workspace-b',
      },
      [{ id: 'workspace-a', name: 'Workspace A' }],
      'workspace-a',
    );

    expect(result.title).toBe('That workspace was not shared with this device');
    expect(result.detail).toContain('pair this device again from Sero desktop');
    expect(result.detail).toContain('Workspace A');
  });

  it('falls back to the raw gateway message for unknown errors', () => {
    expect(
      humanizeGatewayRequestError(
        {
          requestType: 'list_files',
          message: 'Something unexpected happened',
        },
        [],
        null,
      ),
    ).toEqual({
      title: 'Sero Remote could not complete that action',
      detail: 'Something unexpected happened',
    });
  });
});
