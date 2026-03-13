/**
 * Extended gateway request handlers — file browsing, artifacts, web tokens,
 * and session creation. Split from request-handler.ts to stay under 500 LOC.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from './index';
import type { GatewayAuth } from './auth';
import { sendResponse } from './request-handler';

/**
 * Handle extended request types that were added for the web-remote SPA.
 * Returns true if the request was handled, false if it should fall through.
 */
export async function routeExtendedRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  auth: GatewayAuth,
  isMasterAuth: boolean,
): Promise<boolean> {
  switch (request.type) {
    case 'create_session': {
      try {
        const session = await agentOps.createSession(
          request.workspaceId,
          request.name,
        );
        sendResponse(ws, {
          type: 'ok',
          requestType: 'create_session',
          data: session,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'create_session',
          message: err instanceof Error ? err.message : 'Create session failed',
        });
      }
      return true;
    }

    case 'list_files': {
      try {
        const files = await agentOps.listFiles(request.workspaceId, request.path);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'list_files',
          data: { path: request.path, entries: files },
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_files',
          message: err instanceof Error ? err.message : 'List files failed',
        });
      }
      return true;
    }

    case 'read_file': {
      try {
        const content = await agentOps.readFile(request.workspaceId, request.path);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'read_file',
          data: content,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'read_file',
          message: err instanceof Error ? err.message : 'Read file failed',
        });
      }
      return true;
    }

    case 'list_artifacts': {
      try {
        const artifacts = await agentOps.listArtifacts(request.sessionId);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'list_artifacts',
          data: artifacts,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_artifacts',
          message: err instanceof Error ? err.message : 'List artifacts failed',
        });
      }
      return true;
    }

    case 'get_artifact': {
      try {
        const artifact = await agentOps.getArtifact(request.artifactId);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'get_artifact',
          data: artifact,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'get_artifact',
          message: err instanceof Error ? err.message : 'Get artifact failed',
        });
      }
      return true;
    }

    case 'get_session_history': {
      try {
        const messages = await agentOps.getSessionHistory(
          request.workspaceId,
          request.sessionId,
        );
        sendResponse(ws, {
          type: 'ok',
          requestType: 'get_session_history',
          data: messages,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'get_session_history',
          message: err instanceof Error ? err.message : 'Get session history failed',
        });
      }
      return true;
    }

    case 'create_web_token': {
      // Only master token holders can create web tokens
      if (!isMasterAuth) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'create_web_token',
          message: 'Only master token can create web tokens',
        });
        return true;
      }
      try {
        const webToken = auth.webTokens.create(request.label, request.expiryDays);
        sendResponse(ws, {
          type: 'ok',
          requestType: 'create_web_token',
          data: { token: webToken.token, expiresAt: webToken.expiresAt },
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'create_web_token',
          message: err instanceof Error ? err.message : 'Create web token failed',
        });
      }
      return true;
    }

    case 'list_web_tokens': {
      if (!isMasterAuth) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_web_tokens',
          message: 'Only master token can list web tokens',
        });
        return true;
      }
      try {
        const tokens = auth.webTokens.list();
        sendResponse(ws, {
          type: 'ok',
          requestType: 'list_web_tokens',
          data: tokens,
        });
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_web_tokens',
          message: err instanceof Error ? err.message : 'List web tokens failed',
        });
      }
      return true;
    }

    case 'revoke_web_token': {
      if (!isMasterAuth) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'revoke_web_token',
          message: 'Only master token can revoke web tokens',
        });
        return true;
      }
      try {
        const revoked = auth.webTokens.revoke(request.tokenId);
        if (revoked) {
          sendResponse(ws, { type: 'ok', requestType: 'revoke_web_token' });
        } else {
          sendResponse(ws, {
            type: 'error',
            requestType: 'revoke_web_token',
            message: 'Token not found',
          });
        }
      } catch (err) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'revoke_web_token',
          message: err instanceof Error ? err.message : 'Revoke web token failed',
        });
      }
      return true;
    }

    default:
      return false;
  }
}
