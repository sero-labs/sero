/**
 * Model gateway handlers — read and change the model a session runs on.
 *
 * All three need workspace access, the same bar as reading a session's
 * history. Reading the model opens the session in the pool, so the phone
 * can show the model chip before it sends its first prompt.
 *
 * A change is applied by the host, which owns the rules: a model without
 * credentials and an unknown thinking level are both refused there.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import {
  authorizeSessionFromWorkspace,
  hasWorkspaceAccess,
  type GatewayAccessScope,
} from './access-control';
import { makeResponder } from './request-handler';

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Handle the session-model request types.
 * Returns true when the request was handled.
 */
export async function routeModelRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  accessScope: GatewayAccessScope,
  subscribeToSession: (sessionId: string) => void,
): Promise<boolean> {
  if (
    request.type !== 'get_session_model'
    && request.type !== 'set_session_model'
    && request.type !== 'set_session_thinking'
  ) {
    return false;
  }

  const respond = makeResponder(ws, request.requestId);

  if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
    respond({
      type: 'error',
      requestType: request.type,
      message: `Workspace not authorized: ${request.workspaceId}`,
    });
    return true;
  }

  if (request.type === 'get_session_model') {
    try {
      const state = await agentOps.getSessionModel(request.sessionId, request.workspaceId);
      // The session is open now, so events and later changes are allowed.
      authorizeSessionFromWorkspace(accessScope, request.workspaceId, request.sessionId);
      subscribeToSession(request.sessionId);
      respond({ type: 'ok', requestType: 'get_session_model', data: state });
    } catch (err) {
      respond({
        type: 'error',
        requestType: 'get_session_model',
        message: message(err, 'Could not read the session model.'),
      });
    }
    return true;
  }

  if (request.type === 'set_session_model') {
    try {
      const state = await agentOps.setSessionModel(
        request.sessionId,
        request.provider,
        request.modelId,
      );
      respond({ type: 'ok', requestType: 'set_session_model', data: state });
    } catch (err) {
      respond({
        type: 'error',
        requestType: 'set_session_model',
        message: message(err, 'Could not change the model.'),
      });
    }
    return true;
  }

  try {
    const state = await agentOps.setSessionThinkingLevel(request.sessionId, request.level);
    respond({ type: 'ok', requestType: 'set_session_thinking', data: state });
  } catch (err) {
    respond({
      type: 'error',
      requestType: 'set_session_thinking',
      message: message(err, 'Could not change the thinking level.'),
    });
  }
  return true;
}
