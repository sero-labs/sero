import { describe, expect, it } from 'vitest';

import {
  authorizeArtifactFromSession,
  authorizeArtifactsFromSession,
  authorizeSessionFromWorkspace,
  hasArtifactAccess,
  hasSessionAccess,
  type GatewayAccessScope,
} from '@electron/features/gateway/server/access-control';

function createScope(workspaceIds: string[] | null): GatewayAccessScope {
  return {
    authorizedWorkspaceIds: workspaceIds ? new Set(workspaceIds) : null,
    authorizedSessions: new Map(),
    authorizedArtifacts: new Map(),
  };
}

describe('gateway access-control provenance', () => {
  it('requires workspace authorization before a session can be granted', () => {
    const scopedAccess = createScope(['workspace-a']);

    expect(() => {
      authorizeSessionFromWorkspace(scopedAccess, 'workspace-b', 'session-b');
    }).toThrow('Cannot authorize session session-b for unauthorized workspace workspace-b');
    expect(hasSessionAccess(scopedAccess, 'session-b')).toBe(false);

    authorizeSessionFromWorkspace(scopedAccess, 'workspace-a', 'session-a');

    expect(hasSessionAccess(scopedAccess, 'session-a')).toBe(true);
    expect(scopedAccess.authorizedSessions.get('session-a')).toBe('workspace-a');
  });

  it('requires prior session authorization before artifacts can be granted', () => {
    const accessScope = createScope(null);

    expect(() => {
      authorizeArtifactFromSession(accessScope, 'session-a', 'artifact-a');
    }).toThrow('Cannot authorize artifact artifact-a without prior session access for session-a');
    expect(hasArtifactAccess(accessScope, 'artifact-a')).toBe(false);

    authorizeSessionFromWorkspace(accessScope, 'workspace-a', 'session-a');
    authorizeArtifactsFromSession(accessScope, 'session-a', ['artifact-a', 'artifact-b']);

    expect(hasArtifactAccess(accessScope, 'artifact-a')).toBe(true);
    expect(hasArtifactAccess(accessScope, 'artifact-b')).toBe(true);
    expect(accessScope.authorizedArtifacts.get('artifact-b')).toBe('session-a');
  });
});
