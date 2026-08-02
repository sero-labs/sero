/**
 * Golden-frame snapshots of Scout: byte determinism as a contract (P5). Every
 * clip's frames hash to exactly what they hashed to when the goldens were
 * recorded — same source, same frames, every run, every machine.
 *
 * To re-record after a DELIBERATE change to Scout or the grade:
 *   UPDATE_GOLDEN=1 pnpm --filter @sero-ai/ink-and-bones test -- golden
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bakeAllClips, bakeRest } from '../src/index';
import type { Img } from '../src/index';
import { buildCharacter } from '../example/scout';

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'golden.json');

interface Golden {
  rest: string;
  clips: Record<string, { frames: number; sha256: string }>;
}

function hashFrames(frames: readonly Img[]): string {
  const h = createHash('sha256');
  for (const f of frames) h.update(f.toRGBA8());
  return h.digest('hex');
}

function currentGolden(): Golden {
  const spec = buildCharacter();
  const clips: Golden['clips'] = {};
  for (const [name, baked] of bakeAllClips(spec)) {
    clips[name] = { frames: baked.frames.length, sha256: hashFrames(baked.frames) };
  }
  return { rest: hashFrames([bakeRest(spec)]), clips };
}

describe('golden frames', () => {
  it('scout bakes byte-identically to the recorded goldens', () => {
    const now = currentGolden();
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(GOLDEN_PATH, JSON.stringify(now, null, 2) + '\n');
      return;
    }
    const want = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
    expect(now).toEqual(want);
  });
});
