/**
 * The load-and-bake stage. The vm timeout is the load-bearing safety: both
 * hang fixtures — one in buildCharacter, one inside a painter the ENGINE
 * calls mid-bake — must end as structured errors, or a single authored file
 * can wedge the whole background runtime.
 */
import { describe, expect, it } from 'vitest';

import { compilePuppetSource } from './compile';
import {
  BAD_CONTRACT_SOURCE,
  CLEAN_SOURCE,
  HANGING_BUILD_SOURCE,
  HANGING_PAINTER_SOURCE,
  MISSING_EXPORT_SOURCE,
  THROWING_SOURCE,
} from './fixtures';
import { runPuppetBundle } from './run';

async function compiled(source: string): Promise<string> {
  const result = await compilePuppetSource(source);
  if (!result.ok) throw new Error(`fixture did not compile: ${JSON.stringify(result.issues)}`);
  return result.code;
}

describe('runPuppetBundle', () => {
  it('bakes and audits the clean character, every gate green', async () => {
    const run = runPuppetBundle(await compiled(CLEAN_SOURCE));
    if (!run.ok) throw new Error(JSON.stringify(run.issues));
    const { spec, rest, baked, reports } = run.result;
    expect(spec.canvasW).toBe(32);
    expect(rest.w).toBe(32);
    expect(baked.get('idle')?.frames).toHaveLength(4);
    expect(reports).toHaveLength(1);
    expect(reports[0].failed, reports[0].checks.filter((c) => !c.ok).map((c) => c.text).join('; ')).toBe(0);
  });

  it('a missing buildCharacter export is a contract failure', async () => {
    const run = runPuppetBundle(await compiled(MISSING_EXPORT_SOURCE));
    if (run.ok) throw new Error('ran without the export');
    expect(run.stage).toBe('contract');
    expect(run.issues[0].text).toContain('buildCharacter');
  });

  it('a throwing buildCharacter is a load failure carrying the message', async () => {
    const run = runPuppetBundle(await compiled(THROWING_SOURCE));
    if (run.ok) throw new Error('a throwing build ran');
    expect(run.stage).toBe('load');
    expect(run.issues[0].text).toContain('deliberate failure from the fixture');
  });

  it('an impossible spec fails the contract with every problem named', async () => {
    const run = runPuppetBundle(await compiled(BAD_CONTRACT_SOURCE));
    if (run.ok) throw new Error('an impossible spec ran');
    expect(run.stage).toBe('contract');
    const texts = run.issues.map((issue) => issue.text).join('\n');
    expect(texts).toContain('canvasW');
    expect(texts).toContain('Skeleton');
    expect(texts).toContain('clips');
    expect(texts).toContain('restPose');
  });

  it('an infinite loop in buildCharacter times out as a structured error', async () => {
    const run = runPuppetBundle(await compiled(HANGING_BUILD_SOURCE), 500);
    if (run.ok) throw new Error('a hang produced a character');
    expect(run.stage).toBe('load');
    expect(run.issues[0].text).toContain('too long');
  }, 15_000);

  it('an infinite loop inside a painter callback times out too', async () => {
    const run = runPuppetBundle(await compiled(HANGING_PAINTER_SOURCE), 500);
    if (run.ok) throw new Error('a hanging painter produced a character');
    expect(run.stage).toBe('load');
    expect(run.issues[0].text).toContain('too long');
  }, 15_000);
});
