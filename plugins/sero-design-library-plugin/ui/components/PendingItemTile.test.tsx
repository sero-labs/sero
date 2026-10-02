// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PendingItemTile } from './PendingItemTile';

/**
 * The tile that stands in for a Library item that has been paid for but has not
 * arrived.
 *
 * Its reason to exist is a spend problem, not a cosmetic one: without it the
 * grid says nothing happened, and the obvious response to that is to press
 * Generate a second time.
 */


describe('the tile', () => {
  it('fills the grid row like a completed reference card', () => {
    const { container } = render(
      <PendingItemTile
        generation={{ jobId: 'j1', slotId: 's1', status: 'running', error: undefined, runId: undefined }}
        onDismiss={vi.fn()}
      />,
    );

    expect(container.firstElementChild?.classList.contains('h-full')).toBe(true);
    expect(container.firstElementChild?.classList.contains('aspect-4/3')).toBe(false);
  });

  it('says something is coming, and announces it', () => {
    render(
      <PendingItemTile
        generation={{ jobId: 'j1', slotId: 's1', status: 'running', error: undefined, runId: undefined }}
        onDismiss={vi.fn()}
      />,
    );

    const message = screen.getByText('Generating a new reference…');
    expect(message.getAttribute('aria-live')).toBe('polite');
    // Nothing to press while no model run is behind it: a media-only generation
    // has nothing to watch, and cancelling mid-call would not refund it.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the eye while a model run is behind the tile, and restores the spinner when closed', async () => {
    render(
      <PendingItemTile
        generation={{ jobId: 'j1', slotId: 's1', status: 'running', error: undefined, runId: 'run-gen-1' }}
        onDismiss={vi.fn()}
      />,
    );

    const eye = screen.getByRole('button', { name: 'Watch the agent for this reference' });
    expect(eye.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-slot="live-block"]')).toBeNull();

    await userEvent.click(eye);
    expect(eye.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-slot="live-block"]')).not.toBeNull();
    expect(screen.queryByText('Generating a new reference…')).toBeNull();

    await userEvent.click(eye);
    expect(eye.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-slot="live-block"]')).toBeNull();
    expect(screen.getByText('Generating a new reference…')).toBeDefined();
  });

  it('reports a failure and can be got rid of', async () => {
    const onDismiss = vi.fn();
    render(
      <PendingItemTile
        generation={{
          jobId: 'j1',
          slotId: 's1',
          status: 'failed',
          error: 'The provider is rate limiting.',
          runId: undefined,
        }}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('The provider is rate limiting.')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    // The job id, not the slot: dismissing forgets the job record, and a failed
    // one otherwise sits in the grid until the retention sweep a day later.
    expect(onDismiss).toHaveBeenCalledWith('j1');
  });

  it('still says something when the failure carried no message', () => {
    render(
      <PendingItemTile
        generation={{ jobId: 'j1', slotId: 's1', status: 'failed', error: undefined, runId: undefined }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('That generation failed.')).toBeDefined();
  });
});
