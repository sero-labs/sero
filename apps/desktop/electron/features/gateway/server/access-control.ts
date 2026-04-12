export interface GatewayAccessScope {
  authorizedWorkspaceIds: Set<string> | null;
  authorizedSessionIds: Set<string>;
  authorizedArtifactIds: Set<string>;
}

export function hasWorkspaceAccess(scope: GatewayAccessScope, workspaceId: string): boolean {
  return scope.authorizedWorkspaceIds === null || scope.authorizedWorkspaceIds.has(workspaceId);
}

export function authorizeSession(scope: GatewayAccessScope, sessionId: string): void {
  scope.authorizedSessionIds.add(sessionId);
}

export function authorizeSessions(scope: GatewayAccessScope, sessionIds: Iterable<string>): void {
  for (const sessionId of sessionIds) {
    scope.authorizedSessionIds.add(sessionId);
  }
}

export function hasSessionAccess(scope: GatewayAccessScope, sessionId: string): boolean {
  return scope.authorizedSessionIds.has(sessionId);
}

export function authorizeArtifact(scope: GatewayAccessScope, artifactId: string): void {
  scope.authorizedArtifactIds.add(artifactId);
}

export function authorizeArtifacts(scope: GatewayAccessScope, artifactIds: Iterable<string>): void {
  for (const artifactId of artifactIds) {
    scope.authorizedArtifactIds.add(artifactId);
  }
}

export function hasArtifactAccess(scope: GatewayAccessScope, artifactId: string): boolean {
  return scope.authorizedArtifactIds.has(artifactId);
}
