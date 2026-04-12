export interface GatewayAccessScope {
  authorizedWorkspaceIds: Set<string> | null;
  authorizedSessions: Map<string, string>;
  authorizedArtifacts: Map<string, string>;
}

export function hasWorkspaceAccess(scope: GatewayAccessScope, workspaceId: string): boolean {
  return scope.authorizedWorkspaceIds === null || scope.authorizedWorkspaceIds.has(workspaceId);
}

export function authorizeSessionFromWorkspace(
  scope: GatewayAccessScope,
  workspaceId: string,
  sessionId: string,
): void {
  if (!hasWorkspaceAccess(scope, workspaceId)) {
    throw new Error(`Cannot authorize session ${sessionId} for unauthorized workspace ${workspaceId}`);
  }
  scope.authorizedSessions.set(sessionId, workspaceId);
}

export function authorizeSessionsFromWorkspace(
  scope: GatewayAccessScope,
  workspaceId: string,
  sessionIds: Iterable<string>,
): void {
  for (const sessionId of sessionIds) {
    authorizeSessionFromWorkspace(scope, workspaceId, sessionId);
  }
}

export function hasSessionAccess(scope: GatewayAccessScope, sessionId: string): boolean {
  return scope.authorizedSessions.has(sessionId);
}

export function authorizeArtifactFromSession(
  scope: GatewayAccessScope,
  sessionId: string,
  artifactId: string,
): void {
  if (!hasSessionAccess(scope, sessionId)) {
    throw new Error(`Cannot authorize artifact ${artifactId} without prior session access for ${sessionId}`);
  }
  scope.authorizedArtifacts.set(artifactId, sessionId);
}

export function authorizeArtifactsFromSession(
  scope: GatewayAccessScope,
  sessionId: string,
  artifactIds: Iterable<string>,
): void {
  for (const artifactId of artifactIds) {
    authorizeArtifactFromSession(scope, sessionId, artifactId);
  }
}

export function hasArtifactAccess(scope: GatewayAccessScope, artifactId: string): boolean {
  return scope.authorizedArtifacts.has(artifactId);
}
