// @vitest-environment jsdom

import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENSHELL_POLICY_PROFILE_ID, type OpenShellPolicyProfileId } from '@sero-ai/common';
import { CreateView, type RuntimeChoice } from './AddWorkspaceViews';
import { toRuntimeConfig } from './AddWorkspaceMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderCreateView(props: {
  runtimeChoice: RuntimeChoice;
  onRuntimeChoiceChange: (choice: RuntimeChoice) => void;
  policyProfileId?: OpenShellPolicyProfileId;
  onPolicyProfileChange?: (profileId: OpenShellPolicyProfileId) => void;
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

  it('shows the OpenShell policy selector only for OpenShell Local with Dev selected by default', async () => {
    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'default', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).not.toContain('OpenShell policy profile');

    await act(async () => {
      root?.render(renderCreateView({ runtimeChoice: 'openshell-local', onRuntimeChoiceChange: () => undefined }));
    });

    expect(document.body.textContent).toContain('OpenShell policy profile');
    expect(document.body.textContent).toContain('generated policy YAML is not applied yet');
    const devButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Dev'),
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

    const strictButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Strict'),
    );
    expect(strictButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      strictButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPolicyProfileChange).toHaveBeenCalledWith('strict');
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
});
