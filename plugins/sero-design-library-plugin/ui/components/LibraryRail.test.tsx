// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LibraryRail } from './LibraryRail';

describe('custom collections', () => {
  it('exposes deletion from the collection row', async () => {
    const onDeleteCollection = vi.fn();
    render(
      <LibraryRail
        items={[]}
        collections={[{ id: 'collection-1', name: 'Moodboard', colour: 'primary', createdAt: 0 }]}
        scope={{ kind: 'all' }}
        onScopeChange={() => {}}
        onCreateCollection={() => {}}
        onDeleteCollection={onDeleteCollection}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Moodboard' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete collection' }));

    expect(onDeleteCollection).toHaveBeenCalledWith('collection-1');
  });
});
