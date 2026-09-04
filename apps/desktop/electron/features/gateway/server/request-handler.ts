/**
 * Gateway request handler — processes authenticated client requests.
 *
 * Extracted from gateway/index.ts to keep file sizes under 500 LOC.
 * Handles prompt, steer, abort, status, list_workspaces, list_sessions.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest, GatewayResponse } from './protocol';
import type { GatewayAgentOps } from '..';
import type { CostTracker } from './cost-tracker';
import type { GatewayAuth } from '../security/auth';
import type { DevProxyTicketManager } from '../security/devserver-ticket';
import {
  authorizeSessionFromWorkspace,
  authorizeSessionsFromWorkspace,
  hasSessionAccess,
  hasWorkspaceAccess,
  type GatewayAccessScope,
} from './access-control';
import { routeExtendedRequest } from './extended-handlers';
import { routeQueryRequest } from './query-handlers';
import { routeWorkspaceRequest } from './workspace-handlers';

// ── Idempotency store ───────────────────────────────────────
// Prevents duplicate prompt execution from network retries.
// Keys expire after 5 minutes.

const IDEMPOTENCY_TTL_MS = 5 * 60_000;
const IDEMPOTENCY_CLEANUP_MS = 60_000;

interface IdempotencyEntry {
  timestamp: number;
  status: 'pending' | 'done';
}

const idempotencyStore = new Map<string, IdempotencyEntry>();
let idempotencyCleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Start the cleanup timer on first use. */
function ensureIdempotencyTimer(): void {
  if (idempotencyCleanupTimer) return;
  idempotencyCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [key, entry] of idempotencyStore) {
      if (entry.timestamp < cutoff) {
        idempotencyStore.delete(key);
      }
    }
  }, IDEMPOTENCY_CLEANUP_MS);
  // Prevent the timer from keeping the process alive
  if (idempotencyCleanupTimer.unref) {
    idempotencyCleanupTimer.unref();
  }
}

/** Clean up the idempotency store timer. Call on gateway shutdown. */
export function disposeIdempotencyStore(): void {
  if (idempotencyCleanupTimer) {
    clearInterval(idempotencyCleanupTimer);
    idempotencyCleanupTimer = null;
  }
  idempotencyStore.clear();
}

/** Send a JSON response to a WebSocket client. */
export function sendResponse(ws: WebSocket, msg: GatewayResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Build a response sender that echoes the request's `requestId` back so the
 * client can correlate the response with the originating request.
 */
export function makeResponder(
  ws: WebSocket,
  requestId: string | undefined,
): (msg: GatewayResponse) => void {
  if (!requestId) {
    return (msg) => sendResponse(ws, msg);
  }
  return (msg) => sendResponse(ws, { ...msg, requestId });
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
  accessScope: GatewayAccessScope,
  subscribeToSession: (sessionId: string) => void,
  getStatus: () => { running: boolean; port: number; host: string; clients: number },
  costTracker: CostTracker,
  auth?: GatewayAuth,
  isMasterAuth?: boolean,
  devProxyTickets?: DevProxyTicketManager | null,
  previewPorts?: { previewPort: number; previewTlsPort: number } | null,
): Promise<void> {
  const respond = makeResponder(ws, request.requestId);
  // Try extended handlers first (file ops, artifacts, web tokens, sessions)
  if (auth) {
    const handled = await routeExtendedRequest(
      ws,
      agentOps,
      request,
      accessScope,
      subscribeToSession,
      auth,
      isMasterAuth ?? false,
      devProxyTickets ?? null,
      previewPorts ?? null,
    );
    if (handled) return;
  }
  // Read-only queries: cross-session search and usage totals.
  if (await routeQueryRequest(ws, agentOps, request, accessScope, costTracker)) return;

  // Workspace files: status and diff for any authorized workspace, upload
  // for any authorized workspace, commit for owners only.
  if (await routeWorkspaceRequest(ws, agentOps, request, accessScope)) return;

  switch (request.type) {
    case 'prompt': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
          type: 'error',
          requestType: 'prompt',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return;
      }
      // Idempotency check — prevent duplicate execution from retries
      const idemKey = request.idempotencyKey;
      if (idemKey) {
        ensureIdempotencyTimer();
        const existing = idempotencyStore.get(idemKey);
        if (existing) {
          if (existing.status === 'done') {
            respond({ type: 'ok', requestType: 'prompt' });
            return;
          }
          // Still pending — a duplicate retry while the first is running
          respond({
            type: 'error',
            requestType: 'prompt',
            message: 'Request already in progress (duplicate idempotency key)',
          });
          return;
        }
        idempotencyStore.set(idemKey, { timestamp: Date.now(), status: 'pending' });
      }

      // Cost limit check — reject before running the prompt
      const check = costTracker.checkLimits(request.sessionId);
      if (!check.allowed) {
        if (idemKey) idempotencyStore.delete(idemKey);
        respond({
          type: 'error',
          requestType: 'prompt',
          message: `Cost limit exceeded: ${check.reason}`,
        });
        return;
      }

      try {
        // Ensure session is open in an authorized workspace before granting access.
        await agentOps.openSession(request.sessionId, request.workspaceId);
        subscribeToSession(request.sessionId);
        authorizeSessionFromWorkspace(accessScope, request.workspaceId, request.sessionId);
        // Track session as active for concurrency limiting
        costTracker.markActive(request.sessionId);
        // Send prompt (with optional images)
        await agentOps.prompt(request.sessionId, request.text, request.images);
        costTracker.markInactive(request.sessionId);
        if (idemKey) {
          idempotencyStore.set(idemKey, { timestamp: Date.now(), status: 'done' });
        }
        respond({ type: 'ok', requestType: 'prompt' });
      } catch (err) {
        costTracker.markInactive(request.sessionId);
        // Remove pending entry on failure so the client can retry
        if (idemKey) idempotencyStore.delete(idemKey);
        respond({
          type: 'error',
          requestType: 'prompt',
          message: err instanceof Error ? err.message : 'Prompt failed',
        });
      }
      break;
    }

    case 'steer': {
      if (!hasSessionAccess(accessScope, request.sessionId)) {
        respond({
          type: 'error',
          requestType: 'steer',
          message: `Session not authorized: ${request.sessionId}`,
        });
        return;
      }
      try {
        await agentOps.steer(request.sessionId, request.text);
        respond({ type: 'ok', requestType: 'steer' });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'steer',
          message: err instanceof Error ? err.message : 'Steer failed',
        });
      }
      break;
    }

    case 'abort': {
      if (!hasSessionAccess(accessScope, request.sessionId)) {
        respond({
          type: 'error',
          requestType: 'abort',
          message: `Session not authorized: ${request.sessionId}`,
        });
        return;
      }
      try {
        await agentOps.abort(request.sessionId);
        respond({ type: 'ok', requestType: 'abort' });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'abort',
          message: err instanceof Error ? err.message : 'Abort failed',
        });
      }
      break;
    }

    case 'status': {
      respond({
        type: 'ok',
        requestType: 'status',
        data: getStatus(),
      });
      break;
    }

    case 'list_workspaces': {
      try {
        const workspaces = await agentOps.listWorkspaces();
        const filtered = workspaces.filter((workspace) => hasWorkspaceAccess(accessScope, workspace.id));
        respond({
          type: 'ok',
          requestType: 'list_workspaces',
          data: filtered,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_workspaces',
          message: err instanceof Error ? err.message : 'List workspaces failed',
        });
      }
      break;
    }

    case 'list_sessions': {
      if (!hasWorkspaceAccess(accessScope, request.workspaceId)) {
        respond({
          type: 'error',
          requestType: 'list_sessions',
          message: `Workspace not authorized: ${request.workspaceId}`,
        });
        return;
      }
      try {
        const sessions = await agentOps.listSessions(request.workspaceId);
        authorizeSessionsFromWorkspace(
          accessScope,
          request.workspaceId,
          sessions.map((session) => session.id),
        );
        respond({
          type: 'ok',
          requestType: 'list_sessions',
          data: sessions,
        });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'list_sessions',
          message: err instanceof Error ? err.message : 'List sessions failed',
        });
      }
      break;
    }
  }
}
