/**
 * Read-only gateway queries — cross-session search and usage totals.
 *
 * Kept apart from `extended-handlers.ts`, which is near the 500 LOC limit.
 * Both queries answer from what the caller's token can already reach, so
 * neither one can widen access.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import type { CostTracker } from './cost-tracker';
import {
  authorizeSessionFromWorkspace,
  type GatewayAccessScope,
} from './access-control';
import { makeResponder } from './request-handler';

/** Results returned for one search, whatever the client asks for. */
const MAX_SEARCH_RESULTS = 20;

/**
 * The workspaces this token can search.
 *
 * An owner token has no workspace set, so it gets every workspace.
 */
async function searchableWorkspaceIds(
  agentOps: GatewayAgentOps,
  accessScope: GatewayAccessScope,
): Promise<string[]> {
  if (accessScope.authorizedWorkspaceIds !== null) {
    return [...accessScope.authorizedWorkspaceIds];
  }
  const workspaces = await agentOps.listWorkspaces();
  return workspaces.map((workspace) => workspace.id);
}

/**
 * Handle the read-only query requests.
 * Returns true when the request was handled.
 */
export async function routeQueryRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  accessScope: GatewayAccessScope,
  costTracker: CostTracker,
): Promise<boolean> {
  const respond = makeResponder(ws, request.requestId);

  switch (request.type) {
    case 'search_sessions': {
      try {
        const workspaceIds = await searchableWorkspaceIds(agentOps, accessScope);
        const limit = Math.min(request.limit ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
        const results = await agentOps.searchSessions(workspaceIds, request.query, limit);

        // A result the client cannot then open is useless. The search
        // already ran inside the token's workspaces, so authorizing
        // these sessions grants nothing new.
        for (const result of results) {
          authorizeSessionFromWorkspace(accessScope, result.workspaceId, result.sessionId);
        }

        respond({ type: 'ok', requestType: 'search_sessions', data: results });
      } catch (err) {
        respond({
          type: 'error',
          requestType: 'search_sessions',
          message: err instanceof Error ? err.message : 'Search failed',
        });
      }
      return true;
    }

    case 'get_usage': {
      // A scoped token sees only the sessions it has listed. An owner
      // token sees every session the tracker holds.
      const sessionIds = accessScope.authorizedWorkspaceIds === null
        ? costTracker.trackedSessionIds()
        : [...accessScope.authorizedSessions.keys()];

      respond({
        type: 'ok',
        requestType: 'get_usage',
        data: costTracker.getUsage(sessionIds),
      });
      return true;
    }

    default:
      return false;
  }
}
