// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesignAsset, MediaAttempt } from '../../../../shared/media';

/**
 * The tray, as the user meets it.
 *
 * Tiles fetch their bytes through a tool call, so the runtime context is stubbed
 * to return no image — every assertion here is about the state a tile is in and
 * what the panel will let you do about it, which is the part that costs money to
 * get wrong.
 */
vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({ run: async () => ({ content: [], details: {} }) }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import { AssetsTab } from './AssetsTab';

function attempt(overrides: Partial<MediaAttempt> & { id: string }): MediaAttempt {
  return { outcome: 'ready', startedAt: 0, completedAt: 1, ...overrides };
}

function asset(overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    reference: 'assets/asset-1.png',
    request: { capability: 'text-to-image', prompt: 'A warm abstract gradient' },
    attempts: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const handlers = {
  onRetry: vi.fn(),
  onCopyToLibrary: vi.fn(),
  onDelete: vi.fn(),
  onGenerate: vi.fn(),
};

function renderTray(assets: DesignAsset[]) {
  return render(<AssetsTab designId="design-1" assets={assets} {...handlers} />);
}

beforeEach(() => {
  for (const handler of Object.values(handlers)) handler.mockReset();
});

describe('an empty tray', () => {
  it('explains where artwork comes from and offers to make some', async () => {
    renderTray([]);

    expect(screen.getByText(/No artwork yet/)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Generate artwork' }));
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
  });
});

describe('a failed asset', () => {
  it('keeps a tile, says what went wrong, and offers a retry', async () => {
    renderTray([
      asset({
        attempts: [
          attempt({
            id: 'a1',
            outcome: 'failed',
            error: { code: 'provider', message: 'The provider is unavailable.', retryable: true },
          }),
        ],
      }),
    ]);

    // "Provider unavailability yields a local placeholder with asset-only
    // retry" only works if the failure has somewhere to live.
    expect(screen.getByText('The provider is unavailable.')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(handlers.onRetry).toHaveBeenCalledWith('asset-1');
  });

  it('will not offer a retry while one is already running', () => {
    renderTray([
      asset({ jobId: 'job-2', attempts: [attempt({ id: 'a1', outcome: 'failed' })] }),
    ]);

    // Absent rather than greyed out. A disabled button beside a failure reads as
    // the tray being broken, and there is nothing here for a second press to do.
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('does not offer to copy artwork that does not exist yet', () => {
    renderTray([
      asset({
        attempts: [
          attempt({
            id: 'a1',
            outcome: 'failed',
            error: { code: 'provider', message: 'The provider is unavailable.', retryable: true },
          }),
        ],
      }),
    ]);

    // The manual pass read the greyed-out copy button as "there is no way to do
    // this", which is the wrong lesson: there is, once something has landed.
    expect(screen.queryByRole('button', { name: /Copy to Library/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });
});

describe('a ready asset', () => {
  const ready = asset({ attempts: [attempt({ id: 'a1', file: 'art.png' })] });

  it('shows the reference the page must use, and that it does not move', () => {
    renderTray([ready]);

    expect(screen.getByText('assets/asset-1.png')).toBeDefined();
    expect(screen.getByText('Stable across retries.')).toBeDefined();
  });

  it('offers Copy to Library once, then reports where it went', async () => {
    const { unmount } = renderTray([ready]);
    await userEvent.click(screen.getByRole('button', { name: 'Copy to Library' }));
    expect(handlers.onCopyToLibrary).toHaveBeenCalledWith('asset-1');
    unmount();

    renderTray([{ ...ready, copiedItemId: 'item-9' }]);
    // Copying twice would make a second item saying the same thing.
    expect(screen.queryByRole('button', { name: 'Copy to Library' })).toBeNull();
    expect(screen.getByText('In the Library')).toBeDefined();
  });

  it('deletes the asset the panel is showing', async () => {
    renderTray([ready]);

    await userEvent.click(screen.getByRole('button', { name: 'Delete this asset' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('asset-1');
  });
});

describe('the tray as a whole', () => {
  it('totals the Design’s spend separately from the selected asset’s', () => {
    const paid = (id: string, costUsd: number) =>
      asset({
        id,
        request: { capability: 'text-to-image', prompt: `Asset ${id}` },
        attempts: [
          attempt({
            id: `${id}-1`,
            file: 'art.png',
            provenance: {
              providerId: 'fal',
              capability: 'text-to-image',
              model: 'm',
              prompt: 'p',
              parameters: {},
              costUsd,
              startedAt: 0,
              completedAt: 1,
            },
          }),
        ],
      });

    renderTray([asset({ id: 'a', jobId: 'job-1' }), paid('b', 0.04), paid('c', 0.01)]);

    expect(screen.getByText('3 assets · 1 generating')).toBeDefined();
    // Per-asset and per-Design cost are both required, and they are different
    // numbers: the tray totals everything, the panel shows only what is selected.
    expect(screen.getByText('$0.05')).toBeDefined();
    expect(screen.getByText('$0.01')).toBeDefined();
  });

  it('names each tile by its prompt and its state, for a screen reader', () => {
    renderTray([
      asset({ id: 'a', jobId: 'job-1' }),
      asset({ id: 'b', attempts: [attempt({ id: 'a1', file: 'art.png' })] }),
    ]);

    expect(screen.getByRole('button', { name: /A warm abstract gradient — Generating…/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /A warm abstract gradient — Image/ })).toBeDefined();
  });

  it('can be worked entirely from the keyboard', async () => {
    renderTray([
      asset({ id: 'a', request: { capability: 'text-to-image', prompt: 'The older one' } }),
      asset({
        id: 'b',
        request: { capability: 'text-to-image', prompt: 'The newest one' },
        attempts: [attempt({ id: 'a1', outcome: 'failed' })],
      }),
    ]);

    // Tab reaches the tiles in order, and Enter selects — the tiles are buttons
    // rather than clickable divs precisely so this works without extra wiring.
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /The older one/ }));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('The older one')).toBeDefined();

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('The newest one')).toBeDefined();

    // And the action that costs money is reachable the same way.
    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    await userEvent.keyboard('{Enter}');
    expect(handlers.onRetry).toHaveBeenCalledWith('b');
  });

  it('tells a screen reader which tile is selected', async () => {
    renderTray([
      asset({ id: 'a', request: { capability: 'text-to-image', prompt: 'The older one' } }),
      asset({ id: 'b', request: { capability: 'text-to-image', prompt: 'The newest one' } }),
    ]);

    const older = screen.getByRole('button', { name: /The older one/ });
    expect(older.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(older);
    // Selection is what the detail below follows, so it has to be announced.
    expect(older.getAttribute('aria-pressed')).toBe('true');
  });

  it('announces what the tray is doing', () => {
    renderTray([asset({ id: 'a', jobId: 'job-1' })]);

    const live = screen.getByText('1 asset generating');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the newest asset until another is chosen', async () => {
    renderTray([
      asset({ id: 'a', request: { capability: 'text-to-image', prompt: 'The older one' } }),
      asset({ id: 'b', request: { capability: 'text-to-image', prompt: 'The newest one' } }),
    ]);

    // The detail below the sheet follows the selection, and starts on the one
    // most likely to have just arrived.
    expect(screen.getByText('The newest one')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /The older one/ }));
    expect(screen.getByText('The older one')).toBeDefined();
  });
});
