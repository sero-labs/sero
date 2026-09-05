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
    ['voice_transcribe without audioDataUrl', { type: 'voice_transcribe' }],
    ['voice_transcribe with non-string mimeType', {
      type: 'voice_transcribe',
      audioDataUrl: 'data:audio/webm;base64,Zm9v',
      mimeType: 7,
    }],
    ['request with non-string requestId', {
      type: 'voice_status',
      requestId: 7,
    }],
  ])('rejects %s', (_label, payload) => {
    expect(validateRequest(payload)).toBeNull();
  });

  it('accepts voice transcription payloads', () => {
    expect(validateRequest({ type: 'voice_status' })).toEqual({ type: 'voice_status' });

    expect(
      validateRequest({
        type: 'voice_transcribe',
        audioDataUrl: 'data:audio/webm;base64,Zm9v',
        mimeType: 'audio/webm',
      }),
    ).toEqual({
      type: 'voice_transcribe',
      audioDataUrl: 'data:audio/webm;base64,Zm9v',
      mimeType: 'audio/webm',
    });
  });

  it('preserves the optional requestId for correlation', () => {
    expect(
      validateRequest({ type: 'voice_status', requestId: 'req-42' }),
    ).toEqual({ type: 'voice_status', requestId: 'req-42' });

    expect(
      validateRequest({
        type: 'list_workspaces',
        requestId: 'req-99',
      }),
    ).toEqual({ type: 'list_workspaces', requestId: 'req-99' });
  });
  it('accepts a session search with a query only', () => {
    expect(validateRequest({ type: 'search_sessions', query: 'gateway' })).toEqual({
      type: 'search_sessions',
      query: 'gateway',
      limit: undefined,
    });
  });

  it('accepts a session search with a numeric limit', () => {
    expect(
      validateRequest({ type: 'search_sessions', query: 'gateway', limit: 5 }),
    ).toEqual({ type: 'search_sessions', query: 'gateway', limit: 5 });
  });

  it('rejects a session search with no query', () => {
    expect(validateRequest({ type: 'search_sessions' })).toBeNull();
    expect(validateRequest({ type: 'search_sessions', query: '' })).toBeNull();
  });

  it('rejects a session search whose limit is not a number', () => {
    expect(
      validateRequest({ type: 'search_sessions', query: 'a', limit: '5' }),
    ).toBeNull();
  });

  it('accepts a usage request with no fields', () => {
    expect(validateRequest({ type: 'get_usage' })).toEqual({ type: 'get_usage' });
  });
  it('accepts a choice answer', () => {
    expect(validateRequest({ type: 'answer_choice', id: 'c1', optionId: 'worktree' })).toEqual({
      type: 'answer_choice',
      id: 'c1',
      optionId: 'worktree',
    });
  });

  it('rejects a choice answer with no option', () => {
    expect(validateRequest({ type: 'answer_choice', id: 'c1' })).toBeNull();
    expect(validateRequest({ type: 'answer_choice', id: 'c1', optionId: '' })).toBeNull();
  });

  it('rejects a choice answer with no id', () => {
    expect(validateRequest({ type: 'answer_choice', optionId: 'worktree' })).toBeNull();
  });

  describe('widget state requests', () => {
    it('accepts a write with an etag', () => {
      expect(
        validateRequest({
          type: 'app_state_set',
          key: 'todo@ws-1',
          data: { done: 2 },
          expectedEtag: 'etag-1',
        }),
      ).toEqual({
        type: 'app_state_set',
        key: 'todo@ws-1',
        data: { done: 2 },
        expectedEtag: 'etag-1',
      });
    });

    it('keeps a null etag, which says the file is not there yet', () => {
      expect(
        validateRequest({ type: 'app_state_set', key: 'todo', data: 1, expectedEtag: null }),
      ).toMatchObject({ expectedEtag: null });
    });

    it('drops an absent etag rather than inventing one', () => {
      expect(validateRequest({ type: 'app_state_set', key: 'todo', data: 1 })).toEqual({
        type: 'app_state_set',
        key: 'todo',
        data: 1,
      });
    });

    it('refuses a write with no data field', () => {
      expect(validateRequest({ type: 'app_state_set', key: 'todo' })).toBeNull();
    });

    it('refuses a write with an etag of the wrong type', () => {
      expect(
        validateRequest({ type: 'app_state_set', key: 'todo', data: 1, expectedEtag: 7 }),
      ).toBeNull();
    });

    it('refuses a read with no key', () => {
      expect(validateRequest({ type: 'app_state_get' })).toBeNull();
    });
  });
});
