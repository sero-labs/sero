import type { JsonRpcRequest } from './types';

export type ServerRequestHandler = (params: unknown) => unknown;

/**
 * Supported LSP server→client request handlers.
 *
 * This adapter table is intentionally small: only methods required by
 * Sero's current Monaco integration are handled explicitly.
 */
export const SERVER_REQUEST_HANDLERS: Record<string, ServerRequestHandler> = {
  'workspace/configuration': (params: unknown) => getWorkspaceConfigurationItems(params).map(() => ({})),
  'client/registerCapability': () => null,
  'window/workDoneProgress/create': () => null,
};

interface ServerRequestResolution {
  handled: boolean;
  result: unknown;
}

export function resolveServerRequest(req: JsonRpcRequest): ServerRequestResolution {
  const handler = SERVER_REQUEST_HANDLERS[req.method];
  if (!handler) {
    return { handled: false, result: null };
  }

  return { handled: true, result: handler(req.params) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getWorkspaceConfigurationItems(params: unknown): unknown[] {
  if (!isRecord(params)) return [];
  const candidate = params.items;
  return Array.isArray(candidate) ? candidate : [];
}
