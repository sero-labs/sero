import { describe, expect, it } from 'vitest';
import type { PersistentSessionGrantProposal } from '@sero-ai/common';

import { describeGrantAuthority } from '@electron/features/apps/runtime/capabilities/persistent-sessions/clamp';
import { applyPermissionProfile } from '@electron/features/apps/runtime/capabilities/persistent-sessions/permission-tools';

function grant(
  tools: string[],
  permissionProfile: PersistentSessionGrantProposal['subjects'][string]['permissionProfile'],
): PersistentSessionGrantProposal {
  return {
    owner: 'orchestrator',
    scope: 'room-1',
    workspaceId: 'ws-1',
    subjects: {
      member: {
        allowedCwds: ['/workspace'],
        allowedModels: [],
        allowedTools: tools,
        allowedSkills: [],
        allowedThinkingLevels: [],
        permissionProfile,
        maxSystemPromptAdditionBytes: 0,
      },
    },
    maxLiveSessions: 1,
    maxTotalSessions: 1,
    reason: 'Test grant disclosure.',
  };
}

describe('persistent-session permission tools', () => {
  it('denies unrestricted shells and unknown tools to a read-only subject', () => {
    const result = applyPermissionProfile(
      ['read', 'grep', 'bash', 'shell', 'sero-cli', 'mystery_tool'],
      { filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read' },
    );

    expect(result.allowed).toEqual(['read', 'grep', 'sero-cli']);
    expect(result.removed).toEqual(['bash', 'shell', 'mystery_tool']);
  });

  it('keeps an approved shell only for a profile that discloses full commands', () => {
    const result = applyPermissionProfile(
      ['read', 'bash', 'write'],
      { filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit' },
    );

    expect(result).toEqual({ allowed: ['read', 'bash', 'write'], removed: [] });
  });

  it('keeps the Git plugin tool only for a profile with push authority', () => {
    const readOnly = applyPermissionProfile(
      ['git_manager'],
      { filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read' },
    );
    const editing = applyPermissionProfile(
      ['git_manager'],
      { filesystem: 'write', commands: 'all', network: 'none', vcs: 'push' },
    );

    expect(readOnly).toEqual({ allowed: [], removed: ['git_manager'] });
    expect(editing).toEqual({ allowed: ['git_manager'], removed: [] });
  });

  it('describes command authority only when the approved tools can run commands', () => {
    const readOnly = describeGrantAuthority(grant(
      ['read', 'sero-cli'],
      { filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read' },
    ));
    const editing = describeGrantAuthority(grant(
      ['read', 'bash'],
      { filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit' },
    ));

    expect(readOnly).not.toContain('Run commands');
    expect(readOnly).toContain('Tools: read, sero-cli');
    expect(editing).toContain('Run commands');
    expect(editing).toContain('Tools: bash, read');
  });
});
