// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileChange, GitManagerRequest } from '../../shared/types';
import { StagingArea } from './StagingArea';

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setTextInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findClickableRow(container: HTMLElement, label: string): HTMLDivElement {
  const row = Array.from(container.querySelectorAll('div')).find((candidate) => {
    return candidate.className.includes('cursor-pointer') && candidate.textContent?.includes(label);
  });
  if (!(row instanceof HTMLDivElement)) {
    throw new Error(`Clickable row not found: ${label}`);
  }
  return row;
}

describe('StagingArea', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onAction = vi.fn<(action: GitManagerRequest) => void>();
  const onSelectFile = vi.fn<(path: string, staged: boolean) => void>();

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onAction.mockReset();
    onSelectFile.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('keeps commit disabled without staged files and dispatches commits once a staged message is ready', async () => {
    const unstagedOnly: FileChange[] = [
      { path: 'src/clean.ts', status: 'modified', staged: false },
    ];

    await act(async () => {
      root?.render(
        <StagingArea
          fileChanges={unstagedOnly}
          onAction={onAction}
          onSelectFile={onSelectFile}
        />,
      );
    });

    let input = container.querySelector('input');
    let commitButton = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('Commit'));
    if (!(input instanceof HTMLInputElement) || !(commitButton instanceof HTMLButtonElement)) {
      throw new Error('Commit controls not found');
    }

    await act(async () => {
      setTextInputValue(input, 'should stay disabled');
    });
    expect(commitButton.disabled).toBe(true);

    const stagedAndUnstaged: FileChange[] = [
      { path: 'src/app.ts', status: 'modified', staged: true },
      { path: 'src/clean.ts', status: 'modified', staged: false },
    ];

    await act(async () => {
      root?.render(
        <StagingArea
          fileChanges={stagedAndUnstaged}
          onAction={onAction}
          onSelectFile={onSelectFile}
        />,
      );
    });

    const rerenderedInput = container.querySelector('input');
    const rerenderedCommitButton = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes('Commit'));
    if (!(rerenderedInput instanceof HTMLInputElement) || !(rerenderedCommitButton instanceof HTMLButtonElement)) {
      throw new Error('Commit controls not found after rerender');
    }

    await act(async () => {
      setTextInputValue(rerenderedInput, 'land git split');
      rerenderedCommitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledWith({ action: 'commit', message: 'land git split' });
  });

  it('dispatches stage/unstage all actions and opens diffs with the correct staged flag', async () => {
    await act(async () => {
      root?.render(
        <StagingArea
          fileChanges={[
            { path: 'src/app.ts', status: 'modified', staged: false },
            { path: 'src/staged.ts', status: 'added', staged: true },
          ]}
          onAction={onAction}
          onSelectFile={onSelectFile}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Stage all');
      clickButton(container, 'Unstage all');
    });

    expect(onAction).toHaveBeenNthCalledWith(1, { action: 'stage', all: true });
    expect(onAction).toHaveBeenNthCalledWith(2, { action: 'unstage', all: true });

    const unstagedRow = findClickableRow(container, 'app.ts');
    const stagedRow = findClickableRow(container, 'staged.ts');

    await act(async () => {
      unstagedRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      stagedRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectFile).toHaveBeenNthCalledWith(1, 'src/app.ts', false);
    expect(onSelectFile).toHaveBeenNthCalledWith(2, 'src/staged.ts', true);
  });
});
