/**
 * Remote widget gateway handlers — list the widgets a browser may load,
 * and read, watch or write their state.
 *
 * A widget's state file is named by an opaque key. The key is resolved
 * here against the registry and the token's workspaces, so a client can
 * only reach a file that a registered remote widget owns in a workspace
 * it may already read.
 *
 * A write goes through the same atomic path the desktop uses, etag and
 * all, so a browser and a desktop writing at once cannot lose a change.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import { hasWorkspaceAccess, type GatewayAccessScope } from './access-control';
import { makeResponder } from './request-handler';
import { listRemoteWidgets, resolveStateFile, stateKeyWorkspace } from './remote-widgets';
import {
  unwatchWidgetState,
  watchWidgetState,
} from '../bridge/widget-state-bridge';
import { appStateManager } from '@electron/features/apps/state/manager';

/** Issues an asset ticket for one app. Set by the gateway on startup. */
export type IssueAssetTicket = (appId: string) => string;

let issueAssetTicket: IssueAssetTicket = () => '';

/** Tell the handlers how to issue asset tickets. */
export function setAssetTicketIssuer(issue: IssueAssetTicket): void {
  issueAssetTicket = issue;
}

/**
 * Map workspace ids to paths, but only for workspaces this token reads.
 *
 * Returning null for anything else is what keeps a state key inside the
 * token's scope.
 */
async function workspacePathResolver(
  agentOps: GatewayAgentOps,
  accessScope: GatewayAccessScope,
): Promise<(workspaceId: string) => string | null> {
  const workspaces = await agentOps.listWorkspaces();
  const paths = new Map(workspaces.map((workspace) => [workspace.id, workspace.path]));

  return (workspaceId: string) =>
    hasWorkspaceAccess(accessScope, workspaceId) ? paths.get(workspaceId) ?? null : null;
}

/**
 * Handle the remote widget request types.
 * Returns true when the request was handled.
 */
export async function routeWidgetRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  accessScope: GatewayAccessScope,
): Promise<boolean> {
  if (
    request.type !== 'list_remote_widgets'
    && request.type !== 'app_state_get'
    && request.type !== 'app_state_watch'
    && request.type !== 'app_state_unwatch'
    && request.type !== 'app_state_set'
  ) {
    return false;
  }

  const respond = makeResponder(ws, request.requestId);

  if (request.type === 'list_remote_widgets') {
    const workspaceId = request.workspaceId ?? null;
    if (workspaceId && !hasWorkspaceAccess(accessScope, workspaceId)) {
      respond({
        type: 'error',
        requestType: 'list_remote_widgets',
        message: `Workspace not authorized: ${workspaceId}`,
      });
      return true;
    }

    respond({
      type: 'ok',
      requestType: 'list_remote_widgets',
      data: listRemoteWidgets(workspaceId, issueAssetTicket),
    });
    return true;
  }

  const resolveWorkspacePath = await workspacePathResolver(agentOps, accessScope);
  const filePath = resolveStateFile(request.key, resolveWorkspacePath);

  if (!filePath) {
    respond({
      type: 'error',
      requestType: request.type,
      message: `Unknown widget state: ${request.key}`,
    });
    return true;
  }

  if (request.type === 'app_state_set') {
    const result = await appStateManager.write(filePath, request.data, request.expectedEtag);
    // A refused write is not an error: it hands back the newer content,
    // and the widget re-applies its change on top.
    respond({
      type: 'ok',
      requestType: 'app_state_set',
      data: { key: request.key, ...result },
    });
    return true;
  }

  if (request.type === 'app_state_unwatch') {
    unwatchWidgetState(ws, filePath);
    respond({ type: 'ok', requestType: 'app_state_unwatch', data: { key: request.key } });
    return true;
  }

  // The scope is read again at every change, not copied here: a token
  // swapped in while this request was in flight must not keep the watch.
  const keyWorkspace = stateKeyWorkspace(request.key);
  const canReach = () => keyWorkspace === null || hasWorkspaceAccess(accessScope, keyWorkspace);

  const state = request.type === 'app_state_watch'
    ? await watchWidgetState(ws, request.key, filePath, canReach)
    : await appStateManager.readWithEtag(filePath);

  respond({
    type: 'ok',
    requestType: request.type,
    data: { key: request.key, data: state.data, etag: state.etag },
  });
  return true;
}
