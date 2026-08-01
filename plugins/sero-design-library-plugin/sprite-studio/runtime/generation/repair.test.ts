import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CellGrid, Palette } from '../../engine';
import type { MediaProvider, MediaRequest, MediaContext } from '../../../runtime/media/contract';
import type { CharacterRecord } from '../../shared/character';
import { framePlate } from '../plate';
import { repairFrame } from './repair';

/**
 * The failure this guards against cost real money for weeks.
 *
 * Handed a landscape frame and a portrait character reference, most edit
 * endpoints redraw the reference: they answer a different question, in the
 * reference's proportions. The sequence's scale is derived from the returned
 * width, so such an answer also measures the character at several times his
 * height and every check refuses it — after the call is paid for, and with
 * nothing anywhere saying so.
 */

const PALETTE: Palette = [
  [20, 20, 20],
  [200, 40, 40],
  [40, 200, 40],
];

const CHARACTER: CharacterRecord = {
  id: 'char1',
  name: 'Explorer',
  source: 'reference',
  status: 'approved',
  palette: ['#141414', '#c82828', '#28c828'],
  cap: { kind: 'measured' },
  ramps: [],
  artHeight: 10,
  artWidth: 20,
  exportScale: 4,
  basePoseFile: 'characters/char1/base.png',
  root: { footRow: 9, centreCol: 10 },
  styleNotes: '',
  ingestion: {
    block: 8,
    lift: 8,
    sourceWidth: 160,
    sourceHeight: 80,
    measuredColours: 3,
    residual: 0,
    backgroundRemoved: true,
  },
  createdAt: 0,
  updatedAt: 0,
};

function grid(cols: number, rows: number): CellGrid {
  const cells = new Int16Array(cols * rows).fill(-1);
  // A block of drawn matter, so there is a silhouette to measure.
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) cells[y * cols + x] = 1;
  return { cols, rows, cells };
}

/** A provider that always answers with a picture of the shape it was built for. */
function providerReturning(cols: number, rows: number): MediaProvider & { calls: number } {
  const answer = framePlate(grid(cols, rows), PALETTE, { scale: 1 });
  const provider = {
    calls: 0,
    id: 'stub',
    displayName: 'stub',
    capabilities: () => ['image-to-image' as const],
    defaultModel: () => 'stub/edit',
    async generate(_request: MediaRequest, context: MediaContext) {
      provider.calls += 1;
      const stored = await context.store('answer.png', answer.bytes);
      return {
        files: [{ path: stored, mediaType: 'image/png' }],
        provenance: {
          providerId: 'stub',
          capability: 'image-to-image' as const,
          model: 'stub/edit',
          prompt: '',
          parameters: {},
          startedAt: 0,
          completedAt: 0,
        },
      };
    },
  };
  return provider satisfies MediaProvider & { calls: number };
}

let directory: string;

const request = (provider: MediaProvider) => ({
  provider,
  character: CHARACTER,
  palette: PALETTE,
  frame: grid(20, 10),
  basePose: grid(20, 10),
  problem: 'A whole material has moved from the base pose.',
  scale: 8,
  directory,
  signal: new AbortController().signal,
});

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'sprite-repair-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('repairFrame', () => {
  it('refuses an answer in the wrong proportions, and does not buy a second one', async () => {
    // The frame is 20 x 10 cells, so its plate is landscape. This answers in
    // portrait, which is what redrawing the character reference looks like.
    const provider = providerReturning(10, 20);

    const outcome = await repairFrame(request(provider));

    expect(outcome.status).toBe('unchanged');
    expect(outcome.status === 'unchanged' && outcome.reason).toMatch(
      /redrew the character instead of editing this frame/,
    );
    // The whole point: a second identical call buys the same misunderstanding.
    expect(provider.calls).toBe(1);
    expect(outcome.attempts).toBe(1);
  });

  it('still tries twice when the answer is the right shape but no good', async () => {
    // Right proportions, nothing usable in it. That is an ordinary bad draw, and
    // a second attempt can legitimately come back better.
    const provider = providerReturning(20, 10);

    const outcome = await repairFrame({
      ...request(provider),
      // Nothing in the palette matches, so the redraw cannot be read as the
      // character and the attempt is spent rather than accepted.
      palette: [[255, 0, 255]],
    });

    expect(outcome.status).toBe('unchanged');
    expect(outcome.status === 'unchanged' && outcome.reason).not.toMatch(/proportions|redrew/);
    expect(provider.calls).toBe(2);
  });
});
