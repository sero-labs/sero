/**
 * Extended gateway request handlers — file browsing, artifacts, web tokens,
 * and session creation. Split from request-handler.ts to stay under 500 LOC.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import type { GatewayAuth } from '../security/auth';
import type { DevProxyTicketManager } from '../security/devserver-ticket';
import {
  authorizeArtifactsFromSession,
  authorizeSessionFromWorkspace,
  hasArtifactAccess,
  hasSessionAccess,
  hasWorkspaceAccess,
  type GatewayAccessScope,
} from './access-control';
import { makeResponder } from './request-handler';

// Voice transcription host helpers reach shared-infra (for credential lookup),
// which imports the gateway singleton — leading to a circular import if we
// pulled them in statically. Load them on demand inside the handler instead.
async function loadVoiceHost() {
  return import('@electron/features/agent/assistants/voice-transcription-host');
}

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
  subscribeToSession: (sessionId: string) => void,
  auth: GatewayAuth,
  isMasterAuth: boolean,
  devProxyTickets: DevProxyTicketManager | null,
  previewPort: number | null,
): Promise<boolean> {
  const respond = makeResponder(ws, request.requestId);
  switch (request.type) {
    case 'create_session': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
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
        subscribeToSession(session.id);
        respond({
          type: 'ok',
          requestType: 'create_session',
          data: session,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'create_session',
          message: err instanceof Error ? err.message : 'Create session failed',
        });
      }
      return true;
    }

    case 'list_files': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
          type: 'error',
          requestType: 'list_files',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      const listPathErr = validateFilePath(request.path);
      if (listPathErr) {
        respond({ type: 'error', requestType: 'list_files', message: listPathErr });
        return true;
      }
      try {
        const files = await agentOps.listFiles(request.workspaceId, request.path);
        respond({
          type: 'ok',
          requestType: 'list_files',
          data: { path: request.path, entries: files },
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_files',
          message: err instanceof Error ? err.message : 'List files failed',
        });
      }
      return true;
    }

    case 'read_file': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
          type: 'error',
          requestType: 'read_file',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      const readPathErr = validateFilePath(request.path);
      if (readPathErr) {
        respond({ type: 'error', requestType: 'read_file', message: readPathErr });
        return true;
      }
      try {
        const content = await agentOps.readFile(request.workspaceId, request.path);
        respond({
          type: 'ok',
          requestType: 'read_file',
          data: content,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'read_file',
          message: err instanceof Error ? err.message : 'Read file failed',
        });
      }
      return true;
    }

    case 'list_artifacts': {
      if (!hasSessionAccess(accessScope, request.sessionId)) {
        respond({
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
        respond({
          type: 'ok',
          requestType: 'list_artifacts',
          data: artifacts,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_artifacts',
          message: err instanceof Error ? err.message : 'List artifacts failed',
        });
      }
      return true;
    }

    case 'get_artifact': {
      if (!hasArtifactAccess(accessScope, request.artifactId)) {
        respond({
          type: 'error',
          requestType: 'get_artifact',
          message: `Artifact not authorized: ${request.artifactId}`,
        });
        return true;
      }
      try {
        const artifact = await agentOps.getArtifact(request.artifactId);
        respond({
          type: 'ok',
          requestType: 'get_artifact',
          data: artifact,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'get_artifact',
          message: err instanceof Error ? err.message : 'Get artifact failed',
        });
      }
      return true;
    }

    case 'get_session_history': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
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
        subscribeToSession(request.sessionId);
        respond({
          type: 'ok',
          requestType: 'get_session_history',
          data: messages,
        });
      } catch (err) {
        respond({
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
        respond({
          type: 'error',
          requestType: 'create_web_token',
          message: 'Only master token can create web tokens',
        });
        return true;
      }
      try {
        const workspaceIds = request.workspaceIds;
        if (workspaceIds !== null) {
          const unauthorizedWorkspace = workspaceIds.find(
            (workspaceId) => typeof workspaceId !== 'string' || !hasWorkspaceAccess(accessScope, workspaceId),
          );
          if (unauthorizedWorkspace) {
            respond({
              type: 'error',
              requestType: 'create_web_token',
              message: `Workspace not authorized: ${String(unauthorizedWorkspace)}`,
            });
            return true;
          }
        }
        const webToken = auth.webTokens.create(workspaceIds, request.label, request.expiryDays);
        respond({
          type: 'ok',
          requestType: 'create_web_token',
          data: { token: webToken.token, expiresAt: webToken.expiresAt },
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'create_web_token',
          message: err instanceof Error ? err.message : 'Create web token failed',
        });
      }
      return true;
    }

    case 'list_web_tokens': {
      if (!isMasterAuth) {
        respond({
          type: 'error',
          requestType: 'list_web_tokens',
          message: 'Only master token can list web tokens',
        });
        return true;
      }
      try {
        const tokens = auth.webTokens.list();
        respond({
          type: 'ok',
          requestType: 'list_web_tokens',
          data: tokens,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_web_tokens',
          message: err instanceof Error ? err.message : 'List web tokens failed',
        });
      }
      return true;
    }

    case 'revoke_web_token': {
      if (!isMasterAuth) {
        respond({
          type: 'error',
          requestType: 'revoke_web_token',
          message: 'Only master token can revoke web tokens',
        });
        return true;
      }
      try {
        const revoked = auth.webTokens.revoke(request.tokenId);
        if (revoked) {
          respond({ type: 'ok', requestType: 'revoke_web_token' });
        } else {
          respond({
            type: 'error',
            requestType: 'revoke_web_token',
            message: 'Token not found',
          });
        }
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'revoke_web_token',
          message: err instanceof Error ? err.message : 'Revoke web token failed',
        });
      }
      return true;
    }

    case 'list_dev_servers': {
      try {
        const all = await agentOps.listDevServers(request.workspaceId);
        const filtered = all.filter((s) => hasWorkspaceAccess(accessScope, s.workspaceId));
        respond({
          type: 'ok',
          requestType: 'list_dev_servers',
          data: filtered,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_dev_servers',
          message: err instanceof Error ? err.message : 'List dev servers failed',
        });
      }
      return true;
    }

    case 'create_devserver_ticket': {
      if (!devProxyTickets) {
        respond({
          type: 'error',
          requestType: 'create_devserver_ticket',
          message: 'Dev server proxy is not enabled',
        });
        return true;
      }
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
          type: 'error',
          requestType: 'create_devserver_ticket',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return true;
      }
      try {
        const target = await agentOps.resolveDevServerTarget(
          request.workspaceId,
          request.port,
        );
        if (!target) {
          respond({
            type: 'error',
            requestType: 'create_devserver_ticket',
            message:
              'No registered dev server is listening on that port for this workspace',
          });
          return true;
        }
        const issued = devProxyTickets.issue(request.workspaceId, request.port);
        respond({
          type: 'ok',
          requestType: 'create_devserver_ticket',
          data: {
            ticket: issued.ticket,
            expiresAt: issued.expiresAt,
            workspaceId: issued.workspaceId,
            port: issued.port,
            // Previews are served from their own origin (same host, this
            // port) so the client should load them from there.
            previewPort: previewPort ?? undefined,
          },
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'create_devserver_ticket',
          message: err instanceof Error ? err.message : 'Ticket creation failed',
        });
      }
      return true;
    }

    case 'voice_status': {
      try {
        const host = await loadVoiceHost();
        const keys = await host.resolveOpenAiApiKeys();
        respond({
          type: 'ok',
          requestType: 'voice_status',
          data: host.runVoiceStatus(keys),
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'voice_status',
          message: err instanceof Error ? err.message : 'Voice status failed',
        });
      }
      return true;
    }

    case 'voice_transcribe': {
      try {
        const host = await loadVoiceHost();
        const keys = await host.resolveOpenAiApiKeys();
        const status = host.runVoiceStatus(keys);
        if (!status.enabled) {
          respond({
            type: 'error',
            requestType: 'voice_transcribe',
            message:
              status.reason ?? 'Voice transcription is not configured on the host.',
          });
          return true;
        }
        const result = await host.runVoiceTranscribe(
          keys,
          request.audioDataUrl,
          request.mimeType,
        );
        respond({
          type: 'ok',
          requestType: 'voice_transcribe',
          data: result,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'voice_transcribe',
          message: err instanceof Error ? err.message : 'Voice transcription failed',
        });
      }
      return true;
    }

    default:
      return false;
  }
}
