// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode, ComponentPropsWithoutRef } from 'react';

vi.mock('@sero-ai/ui/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@sero-ai/ui/components/ui/checkbox', () => ({
  Checkbox: () => <input type="checkbox" readOnly checked />,
}));

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: ComponentPropsWithoutRef<'button'>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { CheckpointRestoreDialog } from './workspace/CheckpointRestoreDialog';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('CheckpointRestoreDialog', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('uses undo-focused wording in the title and confirmation button', async () => {
    await act(async () => {
      root?.render(
        <CheckpointRestoreDialog
          open
          snapshotId="snap-1"
          undoLabel="Update joke.txt"
          files={[]}
          isLoading={false}
          error={null}
          isRestoring={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Undo this turn?');
    expect(container.textContent).toContain('puts the prompt text back in the composer');
    expect(container.textContent).toContain('Undo summary: Update joke.txt');
    expect(container.textContent).toContain('Undo this turn');
    expect(container.textContent).toContain('Undo snapshot: snap-1');
  });
});
