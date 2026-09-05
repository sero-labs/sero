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
  hasWorkspaceAccess,
  type GatewayAccessScope,
} from './access-control';
import { makeResponder } from './request-handler';
import { answerChoice } from '../bridge/choice-bridge';
import { getNotificationFeed } from '@electron/features/notifications/feed';
import { toNotificationEvent } from '../bridge/notification-bridge';

/** Why an answer was refused, in words a client can show. */
const ANSWER_FAILURES: Record<string, string> = {
  unknown: 'This choice is no longer open.',
  forbidden: 'This choice is out of scope for this token.',
  invalid_option: 'That option is not on this choice.',
};

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
/**
 * What this token is allowed to remove.
 *
 * The same rule `list_notifications` applies: an entry that names a
 * workspace needs access to it, and an entry that names none is
 * owner-only.
 */
function canSee(accessScope: GatewayAccessScope) {
  const isOwner = accessScope.authorizedWorkspaceIds === null;
  return (entry: { workspaceId?: string }): boolean =>
    entry.workspaceId ? hasWorkspaceAccess(accessScope, entry.workspaceId) : isOwner;
}

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

    case 'answer_choice': {
      // A choice that names no workspace is answerable by owner tokens
      // only, because no scoped token can be shown to have a right to it.
      const canReach = (workspaceId: string | null) =>
        workspaceId === null
          ? accessScope.authorizedWorkspaceIds === null
          : hasWorkspaceAccess(accessScope, workspaceId);

      const outcome = answerChoice(request.id, request.optionId, canReach);
      if (outcome.ok) {
        respond({ type: 'ok', requestType: 'answer_choice', data: { id: request.id } });
      } else {
        respond({
          type: 'error',
          requestType: 'answer_choice',
          message: ANSWER_FAILURES[outcome.reason ?? 'unknown'] ?? ANSWER_FAILURES.unknown,
        });
      }
      return true;
    }

    case 'list_notifications': {
      // The feed holds every entry. A scoped token sees only entries for
      // its own workspaces; a global entry is owner-only.
      const isOwner = accessScope.authorizedWorkspaceIds === null;
      const entries = getNotificationFeed()
        .list({ since: request.since, limit: request.limit })
        .filter((entry) =>
          entry.workspaceId
            ? hasWorkspaceAccess(accessScope, entry.workspaceId)
            : isOwner,
        )
        .map(toNotificationEvent);

      respond({ type: 'ok', requestType: 'list_notifications', data: entries });
      return true;
    }

    case 'mark_notifications_read': {
      // Marking an entry read reveals nothing and changes nothing a token
      // could not already read, so no id is refused here.
      const changed = getNotificationFeed().markRead(request.ids);
      respond({ type: 'ok', requestType: 'mark_notifications_read', data: { ids: changed } });
      return true;
    }

    case 'dismiss_notifications': {
      // Removing is destructive, unlike marking read, so a token may only
      // remove what it could have seen in the first place.
      const removed = getNotificationFeed().dismiss(request.ids, canSee(accessScope));
      respond({ type: 'ok', requestType: 'dismiss_notifications', data: { ids: removed } });
      return true;
    }

    case 'clear_read_notifications': {
      const removed = getNotificationFeed().clearRead(canSee(accessScope));
      respond({ type: 'ok', requestType: 'clear_read_notifications', data: { ids: removed } });
      return true;
    }

    default:
      return false;
  }
}
