// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AnimationSummary } from '../../shared/state';
import { CharacterRail } from './CharacterRail';

/**
 * Deleting an animation, and the confirmation in front of it.
 *
 * An animation could be made and not removed. What is guarded here is that
 * nothing is deleted until the confirmation is accepted, and that the
 * confirmation names what is lost — the frames, and the clip, which is the part
 * that cost money.
 */

function summary(id: string, name: string): AnimationSummary {
  return {
    id,
    characterId: 'explorer',
    name,
    status: 'ready',
    loop: 'once',
    playRate: 30,
    frameCount: 11,
    canvas: { cols: 173, rows: 156 },
    hasWarnings: false,
    report: null,
    updatedAt: 0,
  };
}

function renderRail() {
  const onDeleteAnimation = vi.fn();
  render(
    <CharacterRail
      characterName="Explorer"
      animations={[summary('a', 'Whip attack'), summary('b', 'Resting')]}
      openAnimationId="a"
      onOpenSheet={() => {}}
      onOpenAnimation={() => {}}
      onAddAnimations={() => {}}
      onDeleteAnimation={onDeleteAnimation}
    />,
  );
  return { onDeleteAnimation };
}

describe('deleting an animation', () => {
  it('asks first, and does nothing while the question is on screen', async () => {
    const { onDeleteAnimation } = renderRail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Whip attack' }));

    expect(screen.getByText('Delete Whip attack?')).toBeDefined();
    expect(onDeleteAnimation).not.toHaveBeenCalled();
  });

  it('names what is lost, including the part that cost money', async () => {
    renderRail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Whip attack' }));

    expect(screen.getByText(/11 frames and the clip they were made from/)).toBeDefined();
    expect(screen.getByText(/paid for and cannot be recovered/)).toBeDefined();
  });

  it('deletes only the row that was asked about, once it is accepted', async () => {
    const { onDeleteAnimation } = renderRail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Resting' }));
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));

    expect(onDeleteAnimation).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('deletes nothing when the question is declined', async () => {
    const { onDeleteAnimation } = renderRail();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Whip attack' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(onDeleteAnimation).not.toHaveBeenCalled();
  });
});
