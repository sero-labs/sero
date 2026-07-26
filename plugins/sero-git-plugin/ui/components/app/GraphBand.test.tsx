// @vitest-environment jsdom

/**
 * The history band's column headings have to sit over their own values.
 *
 * They are rendered by a different component from the rows, so the only thing
 * keeping them lined up is that both read the same widths. This pins that:
 * hardcode a width in either place and one of these fails.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommitNode } from '../../../shared/types';
import { COLUMN } from '../../lib/history-columns';
import { GraphBand } from './GraphBand';

const COMMITS: CommitNode[] = [
  {
    hash: 'abc123456789',
    shortHash: 'abc1234',
    parents: [],
    authorName: 'Sero Dev',
    authorEmail: 'dev@example.com',
    authorDate: '2026-04-14T12:00:00.000Z',
    subject: 'Line up the history columns',
    refs: [],
  },
];

/** The width class on an element, or '' when it carries none. */
function widthOf(element: Element | undefined): string {
  return element?.className.split(/\s+/).find((name) => /^w-\d+$/.test(name)) ?? '';
}

/** The last three cells of a header or a row — Commit, Author, When. */
function trailingCells(parent: Element | null): Element[] {
  return Array.from(parent?.children ?? []).slice(-3);
}

describe('GraphBand', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  async function render() {
    await act(async () => {
      root?.render(
        <GraphBand
          commits={COMMITS}
          onSelectCommit={vi.fn()}
          collapsed={false}
          onToggleCollapsed={vi.fn()}
        />,
      );
    });
  }

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    root = null;
  });

  it('gives every heading and its column the same width', async () => {
    await render();

    const headings = trailingCells(container.querySelector('button'));
    const cells = trailingCells(container.querySelector('.git-scrollbar div > div > div:last-child'));

    expect(headings.map(widthOf)).toEqual([COLUMN.hash, COLUMN.author, COLUMN.when]);
    expect(cells.map(widthOf)).toEqual([COLUMN.hash, COLUMN.author, COLUMN.when]);
  });

  it('shares its right edge with the rows, so the last column ends where they do', async () => {
    await render();

    const header = container.querySelector('button');
    const row = container.querySelector('.git-scrollbar div > div > div:last-child');
    expect(header?.className).toContain('pr-4');
    expect(row?.className).toContain('pr-4');
  });

  it('keeps the collapse chevron off the columns by putting it first', async () => {
    await render();

    const header = container.querySelector('button');
    // The chevron is the first child, so expanding cannot shift a column.
    expect(header?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });
});
