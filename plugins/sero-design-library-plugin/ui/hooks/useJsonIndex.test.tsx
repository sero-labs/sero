// @vitest-environment jsdom

import { AppContext } from '@sero-ai/app-runtime';
import type * as AppRuntime from '@sero-ai/app-runtime';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => {
  const listeners = new Set<(filePath: string, value: unknown) => void>();
  return {
    listeners,
    watch: vi.fn<(filePath: string) => Promise<unknown>>(),
    unwatch: vi.fn<(filePath: string) => Promise<void>>(),
    onChange: vi.fn((listener: (filePath: string, value: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
});

vi.mock('@sero-ai/app-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof AppRuntime>();
  return {
    ...actual,
    getSeroApi: () => ({ appState: bridge }),
  };
});

import { useJsonIndex } from './useJsonIndex';

const context = {
  appId: 'design-library', workspaceId: 'global', workspacePath: '/profile',
  stateFilePath: '/profile/apps/design-library/state.json',
};

function normalize(value: unknown): Array<{ id: string }> {
  return Array.isArray(value)
    ? value.filter((entry): entry is { id: string } =>
        typeof entry === 'object' && entry !== null && typeof Reflect.get(entry, 'id') === 'string')
    : [];
}

function Probe({ relativePath = 'items/index.json' }: { relativePath?: string }) {
  const entries = useJsonIndex(relativePath, normalize);
  return <span data-testid="ids">{entries.map((entry) => entry.id).join(',')}</span>;
}

beforeEach(() => {
  bridge.listeners.clear();
  bridge.watch.mockReset().mockResolvedValue([{ id: 'initial' }]);
  bridge.unwatch.mockReset().mockResolvedValue(undefined);
  bridge.onChange.mockClear();
});

describe('useJsonIndex', () => {
  it('reads the index and applies matching file updates', async () => {
    render(<AppContext.Provider value={context}><Probe /></AppContext.Provider>);

    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('initial'));
    expect(bridge.watch).toHaveBeenCalledWith('/profile/apps/design-library/items/index.json');

    act(() => {
      for (const listener of bridge.listeners) {
        listener('/profile/apps/design-library/items/index.json', [{ id: 'changed' }]);
        listener('/profile/apps/design-library/jobs/index.json', [{ id: 'ignored' }]);
      }
    });
    expect(screen.getByTestId('ids').textContent).toBe('changed');
  });

  it('unwatches the old file when its path changes and on unmount', async () => {
    const rendered = render(<AppContext.Provider value={context}><Probe /></AppContext.Provider>);
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('initial'));

    rendered.rerender(
      <AppContext.Provider value={context}><Probe relativePath="jobs/index.json" /></AppContext.Provider>,
    );
    await waitFor(() => {
      expect(bridge.unwatch).toHaveBeenCalledWith('/profile/apps/design-library/items/index.json');
      expect(bridge.watch).toHaveBeenCalledWith('/profile/apps/design-library/jobs/index.json');
    });

    rendered.unmount();
    expect(bridge.unwatch).toHaveBeenCalledWith('/profile/apps/design-library/jobs/index.json');
    expect(bridge.listeners.size).toBe(0);
  });
});
