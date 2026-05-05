// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  OPENSHELL_POLICY_PROFILES,
  type OpenShellPolicyDiagnosticsIPC,
} from '@sero-ai/common';
import type { WorkspaceInfo, WorkspaceRuntimeConfig } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { OpenShellPolicyMenu } from './OpenShellPolicyMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialWorkspaceState = useWorkspaceStore.getState();

const diagnostics: OpenShellPolicyDiagnosticsIPC = {
  selectedProfile: OPENSHELL_POLICY_PROFILES[1],
  enforcementStatus: 'profile-preview-only',
  enforcementMessage: 'Sero stores this profile as policy intent only.',
  activePolicy: { available: false, summary: 'Active OpenShell policy unavailable until sandbox creation.' },
  policyList: { available: false, summary: 'Policy history unavailable.' },
  logSummary: { available: true, summary: 'Recent logs scanned.' },
  blockedEvents: [],
  allowDenyPromptsSupported: false,
  allowDenyPromptsMessage: 'Prompt-driven allow/deny decisions are unsupported in current OpenShell Local.',
};

function createWorkspace(runtime?: WorkspaceRuntimeConfig): WorkspaceInfo {
  return {
    id: 'workspace-1',
    name: 'Workspace 1',
    path: '/tmp/workspace-1',
    open: true,
    container: false,
    references: [],
    mounts: [],
    roots: [],
    runtime,
  };
}

async function openPolicyMenu() {
  const trigger = document.querySelector('[title="OpenShell policy: Dev"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Expected OpenShell policy trigger');
  }

  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('OpenShellPolicyMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const setRuntime = vi.fn(async () => {});
  const getRuntimeDiagnostics = vi.fn(async () => [{
    workspaceId: 'workspace-1',
    workspacePath: '/tmp/workspace-1',
    desiredRuntime: 'openshell-local' as const,
    actualRuntime: 'openshell-local' as const,
    containerEnabled: false,
    capabilityAudit: [],
    providerId: 'openshell-local' as const,
    openShellPolicy: diagnostics,
  }]);

  beforeEach(() => {
    setRuntime.mockClear();
    getRuntimeDiagnostics.mockClear();
    const workspace = createWorkspace({
      providerId: 'openshell-local',
      policyProfileId: DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
      policyProfileHistory: Array.from({ length: 20 }, (_, index) => ({
        profileId: DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
        changedAt: `2026-05-05T00:00:${String(index).padStart(2, '0')}.000Z`,
        message: `entry ${index}`,
      })),
    });

    useWorkspaceStore.setState({
      ...initialWorkspaceState,
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
    }, true);

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        workspace: {
          getRuntimeDiagnostics,
          setRuntime,
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    useWorkspaceStore.setState(initialWorkspaceState, true);
  });

  it('shows profiles, policy boundaries, unsupported copy, and no-event diagnostics', async () => {
    const workspace = useWorkspaceStore.getState().workspaces[0];
    await act(async () => {
      root?.render(<OpenShellPolicyMenu workspace={workspace} />);
    });

    await openPolicyMenu();

    for (const profile of OPENSHELL_POLICY_PROFILES) {
      expect(document.body.textContent).toContain(profile.label);
    }
    expect(getRuntimeDiagnostics).toHaveBeenCalledWith('workspace-1');
    expect(document.body.textContent).toContain('Selected: Dev');
    expect(document.body.textContent).toContain('Filesystem');
    expect(document.body.textContent).toContain('Network');
    expect(document.body.textContent).toContain('Process');
    expect(document.body.textContent).toContain('Static boundary');
    expect(document.body.textContent).toContain('Hot-reloadable boundary');
    expect(document.body.textContent).toContain('Sandbox recreation');
    expect(document.body.textContent).toContain('not applied to the running sandbox');
    expect(document.body.textContent).toContain('unsupported in current OpenShell Local');
    expect(document.body.textContent).toContain('No recent denied/blocked OpenShell log events were found');
  });

  it('shows blocked diagnostics events when present', async () => {
    getRuntimeDiagnostics.mockResolvedValueOnce([{
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/workspace-1',
      desiredRuntime: 'openshell-local' as const,
      actualRuntime: 'openshell-local' as const,
      containerEnabled: false,
      capabilityAudit: [],
      providerId: 'openshell-local' as const,
      openShellPolicy: {
        ...diagnostics,
        blockedEvents: [{
          source: 'openshell-logs',
          line: 'landlock denied write to /etc/passwd',
          matchedTerms: ['landlock', 'denied'],
          bestEffort: true,
        }],
      },
    }]);
    const workspace = useWorkspaceStore.getState().workspaces[0];
    await act(async () => {
      root?.render(<OpenShellPolicyMenu workspace={workspace} />);
    });

    await openPolicyMenu();

    expect(document.body.textContent).toContain('landlock denied write to /etc/passwd');
  });

  it('persists profile changes through workspace runtime with capped history', async () => {
    const workspace = useWorkspaceStore.getState().workspaces[0];
    await act(async () => {
      root?.render(<OpenShellPolicyMenu workspace={workspace} />);
    });

    await openPolicyMenu();
    const strictButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Strict'),
    );
    if (!(strictButton instanceof HTMLButtonElement)) {
      throw new Error('Expected Strict profile button');
    }

    await act(async () => {
      strictButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(setRuntime).toHaveBeenCalledTimes(1);
    const nextRuntime = useWorkspaceStore.getState().workspaces[0].runtime;
    expect(nextRuntime?.policyProfileId).toBe('strict');
    expect(nextRuntime?.policyProfileHistory).toHaveLength(20);
    expect(nextRuntime?.policyProfileHistory?.at(-1)).toMatchObject({
      profileId: 'strict',
      message: 'Selected from existing workspace policy menu',
    });
  });
});
