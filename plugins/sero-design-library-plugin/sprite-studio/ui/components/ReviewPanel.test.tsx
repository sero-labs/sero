// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({ run: async () => ({ content: [], details: {} }) }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import type { AnimationSummary } from '../../shared/state';
// eslint-disable-next-line import/first -- must follow the mock above
import { ReviewPanel } from './ReviewPanel';

/**
 * The gate between the clip and the sequence.
 *
 * The frames are a proposal, not a decision, and this screen is where it is
 * overruled. What is guarded here is that a click really changes what will be
 * built, and that a set too small to be an animation cannot be sent — the
 * runtime refuses that too, because the interface is not the only way in.
 */

const REVIEW: NonNullable<AnimationSummary['review']> = {
  sampleCount: 6,
  proposed: [0, 3, 5],
  sampleDurationsMs: [40, 40, 40, 40, 40, 40],
  previewDir: 'characters/explorer/animations/a/samples',
  clipPath: 'characters/explorer/animations/a/clip/clip.mp4',
  proposedAt: 1,
};

const SUMMARY: AnimationSummary = {
  id: 'a',
  characterId: 'explorer',
  name: 'Whip attack · overhead',
  status: 'awaiting-review',
  loop: 'once',
  playRate: 30,
  frameCount: 0,
  canvas: { cols: 173, rows: 156 },
  hasWarnings: false,
  report: null,
  updatedAt: 0,
  review: REVIEW,
};

function renderPanel(review = REVIEW, summary: Partial<AnimationSummary> = {}) {
  const onChoose = vi.fn();
  const onRedo = vi.fn();
  const onDiscard = vi.fn();
  const onOpenShelf = vi.fn();
  render(
    <ReviewPanel
      summary={{ ...SUMMARY, ...summary, review }}
      review={review}
      characterName="Explorer"
      instruction="He cracks the whip out ahead of him."
      onOpenShelf={onOpenShelf}
      onOpenCharacter={() => {}}
      onChoose={onChoose}
      onRedo={onRedo}
      onDiscard={onDiscard}
    />,
  );
  return { onChoose, onRedo, onDiscard, onOpenShelf };
}

describe('choosing the frames', () => {
  it('starts on what the selector proposed, and says how many of how many', () => {
    renderPanel();
    expect(screen.getByText('3 of 6 chosen')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Use these 3 frames' })).toBeDefined();
  });

  it('sends exactly what is on screen, in source order', async () => {
    const { onChoose } = renderPanel();
    // One dropped, one added. Order is source order by decision, whatever
    // order they were clicked in.
    await userEvent.click(screen.getByRole('button', { name: 'Frame 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Frame 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use these 3 frames' }));

    expect(onChoose).toHaveBeenCalledWith([0, 1, 5]);
  });

  it('will not build a set too small to be an animation', async () => {
    const { onChoose } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Frame 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Frame 4' }));

    const use = screen.getByRole('button', { name: 'Keep at least two frames' });
    expect(use.hasAttribute('disabled')).toBe(true);
    await userEvent.click(use);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('marks which frames are kept, for a screen reader as well as a sighted user', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Frame 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Frame 2' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});

/** Which way of playing is on, by its name rather than by its picture. */
function playing(): string | undefined {
  return screen
    .getAllByRole('radio')
    .find((one) => one.getAttribute('aria-checked') === 'true')
    ?.getAttribute('aria-label') ?? undefined;
}

describe('the frames playing beside the clip', () => {
  it('plays what is chosen, and follows a change to it', async () => {
    renderPanel();
    // Three chosen, so three to play. The count is the transport's, not the
    // strip's — the strip shows all six.
    expect(screen.getByText('1 / 3')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Frame 2' }));
    expect(screen.getByText('1 / 4')).toBeDefined();
  });

  it('starts at the speed the clip was drawn at, which is the speed it builds at', () => {
    renderPanel();
    // Not a rate this screen invented. A frame holds until the next one kept,
    // and an evenly spaced preview would be a different animation from the one
    // the button underneath builds.
    expect(screen.getByRole('combobox', { name: 'Speed' }).textContent).toContain('As timed');
  });

  it('opens on the cycle the search found', () => {
    renderPanel({ ...REVIEW, loopWindow: { from: 0, to: 4 } }, { loop: 'forward' });
    expect(playing()).toBe('Loops');
  });

  it('does not offer a loop the build is not going to make', () => {
    // Planned as a loop, but the search found no cycle in the clip — so the
    // build falls back to playing once (D34). Opening on the plan would show a
    // seamless loop that nobody is going to get.
    renderPanel(REVIEW, { loop: 'forward' });
    expect(playing()).toBe('Plays once');
  });

  it('names every way of playing, which an icon on its own does not', async () => {
    // Three pictures in a row. Without a name on each, the only way to find
    // out what one does is to press it.
    renderPanel();
    for (const label of ['Plays once', 'Loops', 'Ping-pong']) {
      expect(screen.getByRole('radio', { name: label })).toBeDefined();
    }
    await userEvent.click(screen.getByRole('radio', { name: 'Ping-pong' }));
    expect(playing()).toBe('Ping-pong');
  });
});

describe('the ways out that are not building', () => {
  it('says that drawing again is paid for, where the button is', () => {
    renderPanel();
    expect(screen.getByText(/buys a new clip at full price/)).toBeDefined();
  });

  it('carries an amended instruction into the redraw', async () => {
    const { onRedo } = renderPanel();
    await userEvent.type(screen.getByRole('textbox'), '  Slower, and keep the whip low.  ');
    await userEvent.click(screen.getByRole('button', { name: /Draw it again/ }));
    expect(onRedo).toHaveBeenCalledWith('Slower, and keep the whip low.');
  });

  it('goes back to the shelf from the trail, which used to be a dead label', async () => {
    const { onOpenShelf } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Sprite Studio' }));
    expect(onOpenShelf).toHaveBeenCalled();
  });
});
