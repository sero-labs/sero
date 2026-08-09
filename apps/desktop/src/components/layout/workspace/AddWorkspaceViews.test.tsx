// @vitest-environment jsdom

import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloneView, CreateView, ImportView, type WorkspaceCreationOption } from './AddWorkspaceViews';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const options: WorkspaceCreationOption[] = [{
  id: 'graphify',
  label: 'Enable Graphify indexing',
  enabled: true,
}];
const noop = vi.fn();
const inputRef = createRef<HTMLInputElement>();

function busyViews(): Array<{ name: string; view: ReactNode }> {
  return [
    {
      name: 'create',
      view: (
        <CreateView
          inputRef={inputRef}
          name="Workspace"
          onNameChange={noop}
          parentPath={null}
          onPickLocation={noop}
          onClearLocation={noop}
          onBack={noop}
          onCreate={noop}
          isCreating
          error={null}
          options={options}
          onOptionChange={noop}
        />
      ),
    },
    {
      name: 'clone',
      view: (
        <CloneView
          inputRef={inputRef}
          url="https://github.com/sero-labs/sero.git"
          onUrlChange={noop}
          name="sero"
          onNameChange={noop}
          parentPath={null}
          onPickLocation={noop}
          onClearLocation={noop}
          onBack={noop}
          onClone={noop}
          isCloning
          error={null}
          options={options}
          onOptionChange={noop}
        />
      ),
    },
    {
      name: 'import',
      view: (
        <ImportView
          onBack={noop}
          onImport={noop}
          isImporting
          error={null}
          options={options}
          onOptionChange={noop}
        />
      ),
    },
  ];
}

describe('workspace creation options', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it.each(busyViews())('disables the $name option while the operation runs', async ({ view }) => {
    await act(async () => root.render(view));

    const option = document.querySelector('#workspace-create-option-graphify');
    expect(option).toBeInstanceOf(HTMLButtonElement);
    expect((option as HTMLButtonElement).disabled).toBe(true);
  });
});
