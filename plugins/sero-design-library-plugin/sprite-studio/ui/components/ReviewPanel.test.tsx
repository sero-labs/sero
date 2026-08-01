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

function renderPanel(review = REVIEW) {
  const onChoose = vi.fn();
  const onRedo = vi.fn();
  const onDiscard = vi.fn();
  const onOpenShelf = vi.fn();
  render(
    <ReviewPanel
      summary={{ ...SUMMARY, review }}
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
