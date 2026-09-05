/**
 * Workspace-file gateway handlers — read the working tree, commit from
 * it, put a file into it, and watch it for changes.
 *
 * Reads need workspace access. The commit needs an owner token: it is the
 * only write in the gateway that changes a repository, so it is held to
 * the highest bar rather than to the workspace scope.
 *
 * An upload only needs workspace access. A token that can prompt a
 * workspace can already have the agent write a file there, so refusing
 * the direct path while allowing the indirect one would buy nothing.
 */

import { WebSocket } from 'ws';
import type { GatewayRequest } from './protocol';
import type { GatewayAgentOps } from '..';
import { hasWorkspaceAccess, type GatewayAccessScope } from './access-control';
import { makeResponder } from './request-handler';
import { GitCommitRefused } from '@electron/ipc/gateway/git-ops';
import { UploadRefused } from '@electron/ipc/gateway/upload-file';
import { unwatchFileTree, watchFileTree } from '../bridge/file-tree-bridge';

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Handle the git request types.
 * Returns true when the request was handled.
 */
export async function routeWorkspaceRequest(
  ws: WebSocket,
  agentOps: GatewayAgentOps,
  request: GatewayRequest,
  accessScope: GatewayAccessScope,
): Promise<boolean> {
  if (
    request.type !== 'git_status'
    && request.type !== 'git_diff'
    && request.type !== 'git_commit'
    && request.type !== 'upload_file'
    && request.type !== 'file_tree_watch'
    && request.type !== 'file_tree_unwatch'
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

  if (request.type === 'file_tree_watch') {
    // The scope is read again at every change, not copied here: a token
    // swapped in while this request was in flight must not keep the watch.
    const { workspaceId } = request;
    const canReach = () => hasWorkspaceAccess(accessScope, workspaceId);
    const watching = await watchFileTree(ws, workspaceId, canReach);
    if (!watching) {
      respond({
        type: 'error',
        requestType: 'file_tree_watch',
        message: `Workspace not found: ${request.workspaceId}`,
      });
      return true;
    }
    // The token may have changed while the roots were being resolved.
    if (!canReach()) {
      unwatchFileTree(ws, workspaceId);
      respond({
        type: 'error',
        requestType: 'file_tree_watch',
        message: `Workspace not authorized: ${workspaceId}`,
      });
      return true;
    }
    respond({
      type: 'ok',
      requestType: 'file_tree_watch',
      data: { workspaceId: request.workspaceId },
    });
    return true;
  }

  if (request.type === 'file_tree_unwatch') {
    unwatchFileTree(ws, request.workspaceId);
    respond({
      type: 'ok',
      requestType: 'file_tree_unwatch',
      data: { workspaceId: request.workspaceId },
    });
    return true;
  }

  if (request.type === 'upload_file') {
    try {
      respond({
        type: 'ok',
        requestType: 'upload_file',
        data: await agentOps.uploadFile(
          request.workspaceId,
          request.path,
          request.contentBase64,
        ),
      });
    } catch (err) {
      respond({
        type: 'error',
        requestType: 'upload_file',
        // A refusal names its reason first, so the client can key on it.
        message: err instanceof UploadRefused
          ? `${err.reason}: ${err.message}`
          : message(err, 'The upload failed.'),
      });
    }
    return true;
  }

  if (request.type === 'git_status') {
    try {
      respond({
        type: 'ok',
        requestType: 'git_status',
        data: await agentOps.gitStatus(request.workspaceId),
      });
    } catch (err) {
      respond({
        type: 'error',
        requestType: 'git_status',
        message: message(err, 'Could not read the working tree.'),
      });
    }
    return true;
  }

  if (request.type === 'git_diff') {
    try {
      respond({
        type: 'ok',
        requestType: 'git_diff',
        data: await agentOps.gitDiff(request.workspaceId, request.path, request.staged ?? false),
      });
    } catch (err) {
      respond({
        type: 'error',
        requestType: 'git_diff',
        message: message(err, 'Could not read the diff.'),
      });
    }
    return true;
  }

  // A commit changes the repository, so a scoped token is refused even
  // for a workspace it can otherwise read.
  if (accessScope.authorizedWorkspaceIds !== null) {
    respond({
      type: 'error',
      requestType: 'git_commit',
      message: 'forbidden: committing needs an owner token.',
    });
    return true;
  }

  try {
    respond({
      type: 'ok',
      requestType: 'git_commit',
      data: await agentOps.gitCommit(request.workspaceId, request.message, request.paths),
    });
  } catch (err) {
    respond({
      type: 'error',
      requestType: 'git_commit',
      // A refusal names its reason first, so the client can key on it.
      message: err instanceof GitCommitRefused
        ? `${err.reason}: ${err.message}`
        : message(err, 'The commit failed.'),
    });
  }
  return true;
}
