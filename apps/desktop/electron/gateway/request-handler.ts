/**
 * Gateway request handler — processes authenticated client requests.
 *
 * Extracted from gateway/index.ts to keep file sizes under 500 LOC.
 * Handles prompt, steer, abort, status, list_workspaces, list_sessions.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest, GatewayResponse } from './protocol';
import type { GatewayAgentOps } from './index';

/** Send a JSON response to a WebSocket client. */
export function sendResponse(ws: WebSocket, msg: GatewayResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Route an authenticated request to the appropriate agent operation.
 * Returns true if the request was handled, false if auth/guard checks
 * should be applied by the caller.
 */
export async function routeAgentRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  subscribeToSession: (sessionId: string) => void,
  getStatus: () => { running: boolean; port: number; host: string; clients: number },
): Promise<void> {
  switch (request.type) {
    case 'prompt': {
      try {
        // Subscribe client to this session for push events
        subscribeToSession(request.sessionId);
        // Ensure session is open
        await agentOps.openSession(request.sessionId, request.workspaceId);
        // Send prompt
        await agentOps.prompt(request.sessionId, request.text);
        sendResponse(ws, { type: 'ok', requestType: 'prompt' });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'prompt',
          message: err instanceof Error ? err.message : 'Prompt failed',
        });
      }
      break;
    }

    case 'steer': {
      try {
        await agentOps.steer(request.sessionId, request.text);
        sendResponse(ws, { type: 'ok', requestType: 'steer' });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'steer',
          message: err instanceof Error ? err.message : 'Steer failed',
        });
      }
      break;
    }

    case 'abort': {
      try {
        await agentOps.abort(request.sessionId);
        sendResponse(ws, { type: 'ok', requestType: 'abort' });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'abort',
          message: err instanceof Error ? err.message : 'Abort failed',
        });
      }
      break;
    }

    case 'status': {
      sendResponse(ws, {
        type: 'ok',
        requestType: 'status',
        data: getStatus(),
      });
      break;
    }

    case 'list_workspaces': {
      try {
        const workspaces = await agentOps.listWorkspaces();
        sendResponse(ws, {
          type: 'ok',
          requestType: 'list_workspaces',
          data: workspaces,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_workspaces',
          message: err instanceof Error ? err.message : 'List workspaces failed',
        });
      }
      break;
    }

    case 'list_sessions': {
      try {
        const sessions = await agentOps.listSessions(request.workspaceId);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'list_sessions',
          data: sessions,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_sessions',
          message: err instanceof Error ? err.message : 'List sessions failed',
        });
      }
      break;
    }
  }
}
