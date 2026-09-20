// @vitest-environment jsdom

/**
 * The projects list has to stay readable with colour ignored and motion off.
 *
 * Each row shows the Architect's own headline, so the check here is that the
 * headline is there and that the glyph beside it is a shape no other state
 * uses. Nothing in the row may animate.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_STATES, ACTIVITY_STATE_WORD } from '@sero-ai/common';
import { ActivityLines } from '../components/ActivityWord';

describe('a project state read with no colour and no motion', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host.remove();
  });

  async function renderEveryState() {
    await act(async () => {
      root?.render(
        <>
          {ACTIVITY_STATES.map((state) => (
            <ActivityLines
              key={state}
              activity={{ state, headline: ACTIVITY_STATE_WORD[state], owner: 'Architect' }}
            />
          ))}
        </>,
      );
    });
  }

  it('gives every state its words and a shape no other state uses', async () => {
    await renderEveryState();

    const shapes = new Set<string>();
    for (const state of ACTIVITY_STATES) {
      const rendered = host.querySelector(`[data-activity-state="${state}"]`);
      expect(rendered?.textContent).toContain(ACTIVITY_STATE_WORD[state]);
      const glyph = rendered?.querySelector('svg')?.getAttribute('class') ?? '';
      expect(glyph).not.toBe('');
      shapes.add(glyph);
    }
    expect(shapes.size).toBe(ACTIVITY_STATES.length);
  });

  it('never animates a state', async () => {
    await renderEveryState();

    for (const element of host.querySelectorAll('*')) {
      expect(element.getAttribute('class') ?? '').not.toMatch(/animate|transition/);
    }
  });
});
