/**
 * Extended gateway request handlers — file browsing, artifacts, web tokens,
 * and session creation. Split from request-handler.ts to stay under 500 LOC.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import type { GatewayAuth } from '../security/auth';
import {
  authorizeArtifactsFromSession,
  authorizeSessionFromWorkspace,
  hasArtifactAccess,
  hasSessionAccess,
  hasWorkspaceAccess,
  type GatewayAccessScope,
} from './access-control';
import { sendResponse } from './request-handler';

/**
 * Validate a file path from a client request.
 * Rejects null bytes and path traversal attempts (.. segments).
 */
function validateFilePath(filePath: string): string | null {
  if (filePath.includes('\0')) return 'Path contains null bytes';
  // Normalize and check for .. traversal (handles /foo/../../../etc)
  const segments = filePath.split('/');
  if (segments.some((s) => s === '..')) return 'Path traversal not allowed';
  return null;
}

/**
 * Handle extended request types that were added for the web-remote SPA.
 * Returns true if the request was handled, false if it should fall through.
 */
export async function routeExtendedRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  accessScope: GatewayAccessScope,
  auth: GatewayAuth,
  isMasterAuth: boolean,
): Promise<boolean> {
  switch (request.type) {
    case 'create_session': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'create_session',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      try {
        const session = await agentOps.createSession(
          request.workspaceId,
          request.name,
        );
        authorizeSessionFromWorkspace(accessScope, request.workspaceId, session.id);
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
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_files',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      const listPathErr = validateFilePath(request.path);
      if (listPathErr) {
        sendResponse(ws, { type: 'error', requestType: 'list_files', message: listPathErr });
        return true;
      }
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
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'read_file',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      const readPathErr = validateFilePath(request.path);
      if (readPathErr) {
        sendResponse(ws, { type: 'error', requestType: 'read_file', message: readPathErr });
        return true;
      }
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
      if (!hasSessionAccess(accessScope, request.sessionId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'list_artifacts',
          message: `Session not authorized: ${request.sessionId}`,
        });
        return true;
      }
      try {
        const artifacts = await agentOps.listArtifacts(request.sessionId);
        authorizeArtifactsFromSession(
          accessScope,
          request.sessionId,
          artifacts.map((artifact) => artifact.id),
        );
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
      if (!hasArtifactAccess(accessScope, request.artifactId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'get_artifact',
          message: `Artifact not authorized: ${request.artifactId}`,
        });
        return true;
      }
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
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        sendResponse(ws, {
          type: 'error',
          requestType: 'get_session_history',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      try {
        const messages = await agentOps.getSessionHistory(
          request.workspaceId,
          request.sessionId,
        );
        authorizeSessionFromWorkspace(accessScope, request.workspaceId, request.sessionId);
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
        const workspaceIds = request.workspaceIds;
        if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
          sendResponse(ws, {
            type: 'error',
            requestType: 'create_web_token',
            message: 'create_web_token requires one or more workspaceIds',
          });
          return true;
        }
        const unauthorizedWorkspace = workspaceIds.find(
          (workspaceId) => typeof workspaceId !== 'string' || !hasWorkspaceAccess(accessScope, workspaceId),
        );
        if (unauthorizedWorkspace) {
          sendResponse(ws, {
            type: 'error',
            requestType: 'create_web_token',
            message: `Workspace not authorized: ${String(unauthorizedWorkspace)}`,
          });
          return true;
        }
        const webToken = auth.webTokens.create(workspaceIds, request.label, request.expiryDays);
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
