import { describe, expect, it } from 'vitest';
import { resolveServerRequest } from '@electron/features/editor/lsp/server-request-handlers';
import type { JsonRpcRequest } from '@electron/features/editor/lsp/types';

function createRequest(method: string, params?: unknown): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };
}

describe('lsp server request handlers', () => {
  it('handles workspace/configuration through the adapter table', () => {
    const request = createRequest('workspace/configuration', {
      items: [{ section: 'typescript' }, { section: 'javascript' }],
    });

    const result = resolveServerRequest(request);

    expect(result).toEqual({ handled: true, result: [{}, {}] });
  });

  it('returns an explicit unhandled result for unsupported methods', () => {
    const request = createRequest('workspace/unknownMethod', { value: 1 });

    const result = resolveServerRequest(request);

    expect(result).toEqual({ handled: false, result: null });
  });

  it('keeps registration/progress requests as no-op null results', () => {
    expect(resolveServerRequest(createRequest('client/registerCapability'))).toEqual({
      handled: true,
      result: null,
    });

    expect(resolveServerRequest(createRequest('window/workDoneProgress/create'))).toEqual({
      handled: true,
      result: null,
    });
  });
});
