// @vitest-environment jsdom

import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENSHELL_POLICY_PROFILE_ID, type OpenShellPolicyProfileId } from '@sero-ai/common';
import { CreateView, type RuntimeChoice } from './AddWorkspaceViews';
import { toCloudGatewayId, toRuntimeConfig, validateCloudEndpoint } from './AddWorkspaceMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderCreateView(props: {
  runtimeChoice: RuntimeChoice;
  onRuntimeChoiceChange: (choice: RuntimeChoice) => void;
  policyProfileId?: OpenShellPolicyProfileId;
  onPolicyProfileChange?: (profileId: OpenShellPolicyProfileId) => void;
  remoteError?: string | null;
  cloudError?: string | null;
}) {
  const inputRef = { current: null } as RefObject<HTMLInputElement | null>;
  return (
    <CreateView
      inputRef={inputRef}
      name="My Workspace"
      onNameChange={() => undefined}
      parentPath={null}
      onPickLocation={() => undefined}
      onClearLocation={() => undefined}
      runtimeChoice={props.runtimeChoice}
      onRuntimeChoiceChange={props.onRuntimeChoiceChange}
      policyProfileId={props.policyProfileId}
      onPolicyProfileChange={props.onPolicyProfileChange}
      remoteGatewayName="sero-remote"
      onRemoteGatewayNameChange={() => undefined}
      remoteSshHost=""
      onRemoteSshHostChange={() => undefined}
      remoteSshKeyPath=""
      onRemoteSshKeyPathChange={() => undefined}
      remotePort="8080"
      onRemotePortChange={() => undefined}
      remoteGatewayHost=""
      onRemoteGatewayHostChange={() => undefined}
      remoteError={props.remoteError ?? null}
      cloudGatewayName="sero-cloud"
      onCloudGatewayNameChange={() => undefined}
      cloudEndpoint=""
      onCloudEndpointChange={() => undefined}
      cloudAuthMode="browser"
      onCloudAuthModeChange={() => undefined}
      cloudResourceLabel=""
      onCloudResourceLabelChange={() => undefined}
      cloudCostLabel=""
      onCloudCostLabelChange={() => undefined}
      cloudIdleTimeoutMinutes="60"
      onCloudIdleTimeoutMinutesChange={() => undefined}
      cloudError={props.cloudError ?? null}
      onBack={() => undefined}
      onCreate={() => undefined}
      isCreating={false}
    />
  );
}

describe('AddWorkspace CreateView runtime selector', () => {
  let containerEl: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    root = createRoot(containerEl);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    containerEl.remove();
  });

  it('shows compact runtime choices including experimental Docker requirement', async () => {
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).toContain('Local macOS');
    expect(document.body.textContent).toContain('Apple Container');
    expect(document.body.textContent).toContain('OpenShell Local');
    expect(document.body.textContent).toContain('Experimental · requires Docker');
    expect(document.body.textContent).toContain('OpenShell Remote');
    expect(document.body.textContent).toContain('Experimental · SSH Linux host with Docker');
    expect(document.body.textContent).toContain('OpenShell Cloud');
    expect(document.body.textContent).toContain('Experimental · hosted gateway, auth, and external costs');
  });

  it('emits the selected OpenShell Local runtime choice', async () => {
    const onRuntimeChoiceChange = vi.fn<(choice: RuntimeChoice) => void>();
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange }));
    });

    const openshellButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('OpenShell Local'),
    );
    expect(openshellButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      openshellButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRuntimeChoiceChange).toHaveBeenCalledWith('openshell-local');
  });

  it('shows remote gateway fields only for OpenShell Remote', async () => {
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).not.toContain('SSH destination');

    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'openshell-remote', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).toContain('requires SSH access to a Linux host with Docker');
    expect(document.body.textContent).toContain('Gateway name');
    expect(document.body.textContent).toContain('SSH destination');
    expect(document.body.textContent).toContain('SSH key path');
    expect(document.body.textContent).toContain('Gateway host');
    expect(document.body.textContent).not.toContain('OpenShell policy profile');
  });

  it('shows cloud gateway fields only for OpenShell Cloud', async () => {
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).not.toContain('hosted gateway endpoint');

    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'openshell-cloud', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).toContain('hosted gateway endpoint');
    expect(document.body.textContent).toContain('may incur external provider costs');
    expect(document.body.textContent).toContain('Endpoint');
    expect(document.body.textContent).toContain('Auth mode');
    expect(document.body.textContent).toContain('Idle timeout');
    expect(document.body.textContent).toContain('Resource label');
    expect(document.body.textContent).toContain('Cost label');
    expect(document.body.textContent).not.toContain('SSH destination');
  });

  it('shows actionable cloud validation errors', async () => {
    await act(async () => {
      root?.render(renderCreateView({
        runtimeChoice: 'openshell-cloud',
        onRuntimeChoiceChange: () => undefined,
        cloudError: 'OpenShell Cloud endpoints must use HTTPS unless they are localhost test endpoints.',
      }));
    });

    expect(document.body.textContent).toContain('endpoints must use HTTPS');
  });

  it('shows actionable remote validation errors', async () => {
    await act(async () => {
      root?.render(renderCreateView({
        runtimeChoice: 'openshell-remote',
        onRuntimeChoiceChange: () => undefined,
        remoteError: 'OpenShell Remote requires a gateway name and SSH destination like user@host.',
      }));
    });

    expect(document.body.textContent).toContain('gateway name and SSH destination like user@host');
  });

  it('shows the OpenShell policy selector only for OpenShell Local with Dev selected by default', async () => {
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).not.toContain('OpenShell policy profile');

    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'openshell-local', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).toContain('OpenShell policy profile');
    expect(document.body.textContent).toContain('Dev · intent only');
    expect(document.body.textContent).not.toContain('generated policy YAML is not applied yet');

    const policyToggle = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Change'),
    );
    expect(policyToggle?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      policyToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(policyToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).toContain('generated policy YAML is not applied yet');
    const devButton = Array.from(document.querySelectorAll('button[role="radio"]')).find(
      (button) => button.textContent?.trim() === 'Dev',
    );
    expect(devButton?.getAttribute('aria-checked')).toBe('true');
  });

  it('emits selected OpenShell policy profile changes', async () => {
    const onPolicyProfileChange = vi.fn<(profileId: OpenShellPolicyProfileId) => void>();
    await act(async () => {
      root?.render(renderCreateView({
        runtimeChoice: 'openshell-local',
        onRuntimeChoiceChange: () => undefined,
        onPolicyProfileChange,
      }));
    });

    const policyToggle = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Change'),
    );
    await act(async () => {
      policyToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const strictButton = Array.from(document.querySelectorAll('button[role="radio"]')).find(
      (button) => button.textContent?.trim() === 'Strict',
    );
    expect(strictButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      strictButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPolicyProfileChange).toHaveBeenCalledWith('strict');
  });
});

describe('AddWorkspaceMenu cloud creation helpers', () => {
  it('uses the openshell-cloud gateway id namespace', () => {
    expect(toCloudGatewayId('Sero Cloud Prod')).toBe('openshell-cloud-sero-cloud-prod');
    expect(toCloudGatewayId('')).toBe('openshell-cloud-gateway');
  });

  it('validates cloud endpoint protocol before saving', () => {
    expect(validateCloudEndpoint('https://gateway.example.com')).toBeNull();
    expect(validateCloudEndpoint('http://localhost:8787')).toBeNull();
    expect(validateCloudEndpoint('http://gateway.example.com')).toContain('must use HTTPS');
    expect(validateCloudEndpoint('not a url')).toContain('valid URL');
  });
});

describe('AddWorkspaceMenu runtime config', () => {
  it('persists selected OpenShell policy profile and creation audit entry', () => {
    const config = toRuntimeConfig('openshell-local', 'browser-agent');

    expect(config?.providerId).toBe('openshell-local');
    expect(config?.policyProfileId).toBe('browser-agent');
    expect(config?.policyProfileUpdatedAt).toEqual(expect.any(String));
    expect(config?.policyProfileHistory).toEqual([
      {
        profileId: 'browser-agent',
        changedAt: config?.policyProfileUpdatedAt,
        message: 'Selected during workspace creation',
      },
    ]);
  });

  it('defaults OpenShell policy profile config to Dev', () => {
    const config = toRuntimeConfig('openshell-local');

    expect(config?.policyProfileId).toBe(DEFAULT_OPENSHELL_POLICY_PROFILE_ID);
  });

  it('creates an OpenShell Remote runtime config from a saved gateway', () => {
    const config = toRuntimeConfig('openshell-remote', DEFAULT_OPENSHELL_POLICY_PROFILE_ID, {
      id: 'openshell-remote-mybox',
      name: 'sero-remote-mybox',
    });

    expect(config).toEqual({
      providerId: 'openshell-remote',
      remoteGatewayId: 'openshell-remote-mybox',
      gatewayName: 'sero-remote-mybox',
      experimental: true,
    });
  });

  it('creates an OpenShell Cloud runtime config from a saved gateway', () => {
    const config = toRuntimeConfig(
      'openshell-cloud',
      DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
      undefined,
      {
        id: 'openshell-cloud-prod',
        name: 'sero-cloud-prod',
        idleTimeoutMinutes: 45,
      },
    );

    expect(config).toEqual({
      providerId: 'openshell-cloud',
      cloudGatewayId: 'openshell-cloud-prod',
      gatewayName: 'sero-cloud-prod',
      idleTimeoutMinutes: 45,
      experimental: true,
    });
  });
});
