// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import { useAppStore } from '@/stores/app';
import { AddWorkspaceMenu } from './AddWorkspaceMenu';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialAppState = useAppStore.getState();

const graphifyManifest: SeroAppManifest = {
  id: 'graphify',
  name: 'Graphify',
  description: null,
  version: '1.0.0',
  packageName: '@sero-ai/sero-graphify-plugin',
  icon: 'network',
  stateFile: '.sero/apps/graphify/state.json',
  scope: 'global',
  globalStatePath: '/tmp/graphify-state.json',
  uiEntry: null,
  runtimeEntry: null,
  component: null,
  devPort: undefined,
  remoteEntryOverride: null,
  packagePath: '/tmp/graphify',
  isPlugin: true,
  widgets: [],
  workspaceCreation: {
    label: 'Enable Graphify indexing',
    defaultEnabled: true,
    tool: 'graphify_index',
  },
};

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}"`);
  }
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('AddWorkspaceMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    useAppStore.setState({
      ...initialAppState,
      apps: [
        ...initialAppState.apps,
        {
          id: 'graphify',
          label: 'Graphify',
          icon: 'network',
          builtin: false,
          manifest: graphifyManifest,
        },
      ],
    }, true);

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
    useAppStore.setState(initialAppState, true);
    vi.unstubAllGlobals();
  });

  it('restores contribution defaults after leaving the create view', async () => {
    await act(async () => {
      root?.render(<AddWorkspaceMenu />);
    });

    const trigger = document.querySelector('[title="Add workspace"]');
    if (!(trigger instanceof HTMLElement)) throw new Error('Expected add workspace trigger');
    await click(trigger);
    await click(getButton('Create New'));

    const switchId = '#workspace-create-option-graphify';
    const option = document.querySelector(switchId);
    if (!(option instanceof HTMLButtonElement)) throw new Error('Expected Graphify option');
    expect(option.getAttribute('aria-checked')).toBe('true');

    await click(option);
    expect(option.getAttribute('aria-checked')).toBe('false');
    await click(getButton('Back'));
    await click(getButton('Create New'));

    expect(document.querySelector(switchId)?.getAttribute('aria-checked')).toBe('true');
  });
});
