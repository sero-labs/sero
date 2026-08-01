// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({ run: async () => ({ content: [], details: {} }) }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import type { AnimationRecord, FrameRecord } from '../../shared/character';
// eslint-disable-next-line import/first -- must follow the mock above
import { FramePanel } from './FramePanel';

/**
 * Both ways of fixing, on every frame (D18).
 *
 * The automatic repair handles frames that fail a check, and that is not
 * enough: a frame can pass every measurement and still be wrong to the eye, and
 * no measurement will ever raise it. So a frame with a clean report must still
 * offer both routes, and the AI must be askable without being told what is
 * wrong — the tidy-up that hides these behind a failed check is exactly the
 * regression this guards.
 */

function frame(overrides: Partial<FrameRecord> = {}): FrameRecord {
  return {
    id: 'frame-1',
    file: 'characters/explorer/animations/a/frames/frame-1.png',
    root: { x: 86, y: 148 },
    grounded: true,
    durationMs: 33,
    provenance: { model: 'grok', kind: 'video', repairs: 0, createdAt: 0 },
    findings: [],
    ...overrides,
  };
}

function animation(frames: FrameRecord[]): AnimationRecord {
  return {
    id: 'a',
    characterId: 'explorer',
    plan: {
      name: 'Whip attack · overhead',
      instruction: 'He cracks the whip out ahead of him.',
      frameCount: frames.length,
      playRate: 30,
      loop: 'once',
    },
    status: 'ready',
    canvas: { cols: 173, rows: 156 },
    anchor: { col: 86, row: 148 },
    frames,
    findings: [],
    report: null,
    history: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function renderPanel(record: AnimationRecord) {
  const onFix = vi.fn();
  const onEditPixels = vi.fn();
  render(
    <FramePanel
      animation={record}
      index={0}
      onEditPixels={onEditPixels}
      onFix={onFix}
      onDuplicate={() => {}}
      onSetDuration={() => {}}
      onDelete={() => {}}
    />,
  );
  return { onFix, onEditPixels };
}

describe('a frame that passed every check', () => {
  it('still offers both ways of fixing it', () => {
    renderPanel(animation([frame()]));
    expect(screen.getByText('passed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit the pixels yourself' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ask the AI to redraw it' })).toBeDefined();
  });

  it('lets the AI be asked without being told what is wrong', async () => {
    const { onFix } = renderPanel(animation([frame()]));
    await userEvent.click(screen.getByRole('button', { name: 'Ask the AI to redraw it' }));
    expect(onFix).toHaveBeenCalledWith('');
  });

  it('passes on what the user typed when they did say', async () => {
    const { onFix } = renderPanel(animation([frame()]));
    await userEvent.type(
      screen.getByRole('textbox'),
      '  The whip is too thin where it crosses his hat.  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask the AI to redraw it' }));
    expect(onFix).toHaveBeenCalledWith('The whip is too thin where it crosses his hat.');
  });
});

describe('a frame the checks complained about', () => {
  it('says what each finding was, rather than only that something failed', () => {
    renderPanel(
      animation([
        frame({
          findings: [
            { check: 'Source framing', level: 'refuse', message: 'the whip touches the edge' },
          ],
        }),
      ]),
    );
    expect(screen.getByText('Source framing')).toBeDefined();
    expect(screen.getByText('the whip touches the edge')).toBeDefined();
  });
});

describe('what the frame says about itself', () => {
  it('reports its hold in ticks as well as milliseconds', () => {
    renderPanel(animation([frame({ durationMs: 66 })]));
    expect(screen.getByText(/2 ticks · 66 ms/)).toBeDefined();
  });

  it('declares a repair the run made without asking', () => {
    renderPanel(
      animation([
        frame({ provenance: { model: 'nano', kind: 'pose', repairs: 1, createdAt: 0 } }),
      ]),
    );
    expect(screen.getByText('redrawn once')).toBeDefined();
  });
});
