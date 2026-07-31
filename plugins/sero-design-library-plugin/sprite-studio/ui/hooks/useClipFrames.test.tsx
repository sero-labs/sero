// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClipFramesTarget } from '../lib/clip-frames';

/**
 * Decoding a clip exactly once.
 *
 * This is the only path from a finished clip to a compiled animation, and it is
 * expensive — sixty seeks and a few hundred staging calls. The state it watches
 * is rewritten on every unrelated change, so the trap is a sweep that starts
 * again on each render and pays for the same clip several times, or worse
 * attaches the same frames twice. Both are what these assert against.
 */

const attempts: string[] = [];
let answer: (target: ClipFramesTarget) => Promise<{ ok: boolean; error?: string }> = async () => ({
  ok: true,
});

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({ run: async () => ({ content: [], details: {} }) }),
}));

vi.mock('../lib/clip-frames', () => ({
  clipKey: (target: { animationId: string; clipPath: string }) =>
    `${target.animationId}:${target.clipPath}`,
  attachClipFrames: async (_tools: unknown, target: ClipFramesTarget) => {
    attempts.push(`${target.animationId}:${target.clipPath}`);
    return answer(target);
  },
}));

// eslint-disable-next-line import/first -- must follow the mocks above
import { useClipFrames } from './useClipFrames';

function Probe({ targets }: { targets: ClipFramesTarget[] }) {
  const { failed } = useClipFrames(targets);
  return <span data-testid="failed">{failed.join(',')}</span>;
}

function target(animationId: string, clipPath = 'clip.mp4'): ClipFramesTarget {
  return { animationId, clipPath, sampleFps: 12, expectedFrames: 60 };
}

beforeEach(() => {
  attempts.length = 0;
  answer = async () => ({ ok: true });
});

describe('a clip waiting for its frames', () => {
  it('is decoded once, however often the page re-renders', async () => {
    const targets = [target('a')];
    const { rerender } = render(<Probe targets={targets} />);
    await waitFor(() => expect(attempts).toEqual(['a:clip.mp4']));

    // A fresh array every render is what reactive state actually hands over.
    rerender(<Probe targets={[target('a')]} />);
    rerender(<Probe targets={[target('a')]} />);
    await waitFor(() => expect(attempts).toEqual(['a:clip.mp4']));
  });

  it('takes clips one at a time rather than all at once', async () => {
    const gate: { release: (() => void) | null } = { release: null };
    answer = async () =>
      new Promise((resolve) => {
        gate.release = () => resolve({ ok: true });
      });

    render(<Probe targets={[target('a'), target('b')]} />);
    await waitFor(() => expect(attempts).toEqual(['a:clip.mp4']));

    gate.release?.();
    await waitFor(() => expect(attempts).toEqual(['a:clip.mp4', 'b:clip.mp4']));
  });

  it('is decoded again when a redo puts a different clip under the same animation', async () => {
    const { rerender } = render(<Probe targets={[target('a', 'first.mp4')]} />);
    await waitFor(() => expect(attempts).toEqual(['a:first.mp4']));

    rerender(<Probe targets={[target('a', 'second.mp4')]} />);
    await waitFor(() => expect(attempts).toEqual(['a:first.mp4', 'a:second.mp4']));
  });
});

describe('a clip the browser cannot decode', () => {
  it('is attempted once and then reported, not retried for the rest of the session', async () => {
    answer = async () => ({ ok: false, error: 'no codec' });
    const { rerender, getByTestId } = render(<Probe targets={[target('a')]} />);
    await waitFor(() => expect(getByTestId('failed').textContent).toBe('a:clip.mp4'));

    rerender(<Probe targets={[target('a')]} />);
    await waitFor(() => expect(attempts).toEqual(['a:clip.mp4']));
  });

  it('is marked attempted even when the decode throws outright', async () => {
    answer = async () => {
      throw new Error('the clip could not be read');
    };
    const { getByTestId } = render(<Probe targets={[target('a')]} />);
    await waitFor(() => expect(getByTestId('failed').textContent).toBe('a:clip.mp4'));
    expect(attempts).toEqual(['a:clip.mp4']);
  });
});
