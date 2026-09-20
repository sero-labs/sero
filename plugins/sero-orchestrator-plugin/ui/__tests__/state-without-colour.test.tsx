// @vitest-environment jsdom

/**
 * Every state has to survive with its colour ignored and its motion off.
 *
 * So this renders all nine of them and checks the two things that carry the
 * meaning: the word, and a glyph whose shape no other state uses. Colour is
 * allowed to help; it is never allowed to be the difference.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_STATES, ACTIVITY_STATE_WORD } from '@sero-ai/common';
import { ActivityWord } from '../components/ActivityWord';

describe('a state read with no colour and no motion', () => {
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

  it('gives every state its word and a shape no other state uses', async () => {
    await act(async () => {
      root?.render(
        <>
          {ACTIVITY_STATES.map((state) => (
            <ActivityWord key={state} state={state} word={ACTIVITY_STATE_WORD[state]} />
          ))}
        </>,
      );
    });

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
    await act(async () => {
      root?.render(
        <>
          {ACTIVITY_STATES.map((state) => (
            <ActivityWord key={state} state={state} word={ACTIVITY_STATE_WORD[state]} />
          ))}
        </>,
      );
    });

    for (const element of host.querySelectorAll('*')) {
      expect(element.getAttribute('class') ?? '').not.toMatch(/animate|transition/);
    }
  });
});
