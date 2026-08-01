// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { BackdropPicker, BackdropProvider, useBackdrop } from './backdrop';

/**
 * What a sprite is shown against.
 *
 * A way of looking, not a property of the artwork: it is a background on the
 * box the picture sits in, one choice for the whole page, and it reaches
 * nothing that is written to disk.
 */

function Pane({ label }: { label: string }) {
  const backdrop = useBackdrop();
  return <div data-testid={label} style={backdrop} />;
}

function shown(label: string): CSSStyleDeclaration {
  return screen.getByTestId(label).style;
}

function renderPage() {
  return render(
    <BackdropProvider>
      <BackdropPicker />
      <Pane label="player" />
      <Pane label="strip" />
    </BackdropProvider>,
  );
}

describe('what a sprite is shown against', () => {
  it('adds nothing by default, which is the checker a sprite has always had', () => {
    renderPage();
    expect(shown('player').backgroundImage).toContain('linear-gradient');
    expect(shown('player').backgroundColor).toBe('');
  });

  it('puts the sprite on white, and takes the checker away with it', async () => {
    // Not both. A checker behind a white pane is neither one thing nor the
    // other, and the point of white is a plain field to read an outline on.
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'White background' }));
    expect(shown('player').backgroundColor).toBe('rgb(255, 255, 255)');
    expect(shown('player').backgroundImage).toBe('');
  });

  it('puts the sprite on black', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Black background' }));
    expect(shown('player').backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('changes every pane at once, not the one the control is in', async () => {
    // The frame was picked off a strip and is watched in a player. Judging it
    // against white in one and the checker in the other is the comparison
    // failing to be a comparison.
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Black background' }));
    expect(shown('strip').backgroundColor).toBe(shown('player').backgroundColor);
  });

  it('goes back to nothing added', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'White background' }));
    await userEvent.click(screen.getByRole('radio', { name: 'No background' }));
    expect(shown('player').backgroundImage).toContain('linear-gradient');
  });

  it('cannot be left showing the sprite against nothing at all', async () => {
    // Radix clears a single-mode group when the on item is pressed again, and
    // an empty value would mean a pane with no background rule at all.
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'White background' }));
    await userEvent.click(screen.getByRole('radio', { name: 'White background' }));
    expect(shown('player').backgroundColor).toBe('rgb(255, 255, 255)');
  });
});
