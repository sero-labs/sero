import { describe, expect, it } from 'vitest';

import { applyPermissionProfile } from '@electron/features/apps/runtime/capabilities/persistent-sessions/permission-tools';

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
});
