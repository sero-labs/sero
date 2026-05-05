// @vitest-environment jsdom

import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateView, type RuntimeChoice } from './AddWorkspaceViews';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderCreateView(props: {
  runtimeChoice: RuntimeChoice;
  onRuntimeChoiceChange: (choice: RuntimeChoice) => void;
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
});
