import { describe, expect, it } from 'vitest';

import { validateRequest } from '@electron/features/gateway/server/protocol';

describe('gateway protocol request validation', () => {
  it('accepts valid sensitive request payloads', () => {
    expect(
      validateRequest({ type: 'connect', token: 'secret-token', clientType: 'web', clientId: 'client-1' }),
    ).toEqual({ type: 'connect', token: 'secret-token', clientType: 'web', clientId: 'client-1' });

    expect(
      validateRequest({
        type: 'prompt',
        workspaceId: 'workspace-a',
        sessionId: 'session-a',
        text: 'hello',
        images: [{ data: 'Zm9v', mimeType: 'image/png' }],
        idempotencyKey: 'idem-1',
      }),
    ).toEqual({
      type: 'prompt',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      text: 'hello',
      images: [{ data: 'Zm9v', mimeType: 'image/png' }],
      idempotencyKey: 'idem-1',
    });

    expect(
      validateRequest({
        type: 'create_web_token',
        workspaceIds: ['workspace-a', 'workspace-b'],
        label: 'Shared access',
        expiryDays: 3,
      }),
    ).toEqual({
      type: 'create_web_token',
      workspaceIds: ['workspace-a', 'workspace-b'],
      label: 'Shared access',
      expiryDays: 3,
    });

    expect(
      validateRequest({
        type: 'create_web_token',
        workspaceIds: null,
        label: 'Owner device',
      }),
    ).toEqual({
      type: 'create_web_token',
      workspaceIds: null,
      label: 'Owner device',
      expiryDays: undefined,
    });
  });

  it.each([
    ['connect without token', { type: 'connect', clientType: 'web' }],
    ['connect with invalid clientType', { type: 'connect', token: 'secret-token', clientType: 'desktop' }],
    ['prompt without workspaceId', { type: 'prompt', sessionId: 'session-a', text: 'hi' }],
    ['prompt with malformed images', {
      type: 'prompt',
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      text: 'hi',
      images: [{ data: 1, mimeType: 'image/png' }],
    }],
    ['get_session_history without sessionId', { type: 'get_session_history', workspaceId: 'workspace-a' }],
    ['create_web_token without workspaceIds', { type: 'create_web_token', label: 'Shared access' }],
    ['create_web_token with empty workspaceIds', { type: 'create_web_token', workspaceIds: [] }],
    ['create_web_token with invalid workspaceIds', { type: 'create_web_token', workspaceIds: ['workspace-a', 3] }],
    ['create_web_token with invalid null-like workspaceIds', { type: 'create_web_token', workspaceIds: 'all' }],
    ['create_web_token with invalid expiryDays', {
      type: 'create_web_token',
      workspaceIds: ['workspace-a'],
      expiryDays: 0,
    }],
    ['get_artifact without artifactId', { type: 'get_artifact' }],
    ['get_artifact with non-string artifactId', { type: 'get_artifact', artifactId: 7 }],
  ])('rejects %s', (_label, payload) => {
    expect(validateRequest(payload)).toBeNull();
  });
});
