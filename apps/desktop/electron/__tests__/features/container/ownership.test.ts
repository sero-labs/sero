import { describe, expect, it, vi } from 'vitest';

vi.mock('@electron/platform/env', () => ({ SERO_FIXED_ROOT: '/sero/current' }));

import {
  SERO_INSTALLATION_ROOT_LABEL,
  appleContainerBelongsToWorkspace,
  appleContainerHasCurrentIdentity,
  parseAppleContainerOwnership,
  seroOwnershipLabels,
} from '@electron/features/container/core/ownership';

const identity = { workspaceId: 'workspace-a', workspacePath: '/profiles/a/workspaces/workspace-a' };

describe('Apple Container ownership', () => {
  it('recognizes a legacy deterministic container by its workspace mount', () => {
    const ownership = parseAppleContainerOwnership({
      configuration: {
        id: 'sero-workspace-a',
        mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
      },
    }, 'sero-workspace-a');

    expect(appleContainerBelongsToWorkspace(ownership, identity)).toBe(true);
    expect(appleContainerHasCurrentIdentity(ownership, identity)).toBe(false);
  });

  it('recognizes current labels and rejects another installation', () => {
    const current = parseAppleContainerOwnership({
      configuration: {
        labels: seroOwnershipLabels('apple-container', identity),
        mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
      },
    }, 'sero-workspace-a');
    const foreign = parseAppleContainerOwnership({
      configuration: {
        labels: {
          ...seroOwnershipLabels('apple-container', identity),
          [SERO_INSTALLATION_ROOT_LABEL]: '/sero/other',
        },
        mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
      },
    }, 'sero-workspace-a');

    expect(appleContainerHasCurrentIdentity(current, identity)).toBe(true);
    expect(appleContainerBelongsToWorkspace(foreign, identity)).toBe(false);
  });
});
