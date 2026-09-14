// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomDeleteButton } from '../components/RoomDeleteButton';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@sero-ai/ui/components/ui/alert-dialog', () => {
  const Wrap = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Action = ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  );
  return {
    AlertDialog: Wrap,
    AlertDialogAction: Action,
    AlertDialogCancel: Action,
    AlertDialogContent: Wrap,
    AlertDialogDescription: Wrap,
    AlertDialogFooter: Wrap,
    AlertDialogHeader: Wrap,
    AlertDialogTitle: Wrap,
    AlertDialogTrigger: Wrap,
  };
});

describe('RoomDeleteButton', () => {
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
  });

  it('requires confirmation and explains the retained Room data and worktree refusal', async () => {
    const onDelete = vi.fn();
    await act(async () => root.render(<RoomDeleteButton busy={false} onDelete={onDelete} />));

    expect(container.querySelector('button[aria-label="Delete Room"]')).not.toBeNull();
    expect(container.textContent).toContain('persistent member session history');
    expect(container.textContent).toContain('worktree cannot be preserved');

    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Delete Room');
    await act(async () => confirm?.click());
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
