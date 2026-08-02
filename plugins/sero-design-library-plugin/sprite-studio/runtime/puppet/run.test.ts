/**
 * The worker stage. The termination guarantee is the load-bearing safety:
 * hangs in buildCharacter, hangs inside a painter the ENGINE calls mid-bake,
 * microtask floods that outlive the bake, and unbounded allocation must all
 * end as structured errors (or a clean result with the worker reaped) —
 * never a wedged runtime.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compilePuppetWorker } from './compile';
import { DETERMINISM_SOURCE, DRIVER_SOURCE } from './driver';
import {
  ASYNC_FLOOD_SOURCE,
  BAD_CONTRACT_SOURCE,
  CLEAN_SOURCE,
  GIANT_PAINT_SOURCE,
  NEW_DATE_SOURCE,
  HANGING_BUILD_SOURCE,
  HANGING_PAINTER_SOURCE,
  MEMORY_HOG_SOURCE,
  MISSING_EXPORT_SOURCE,
  RANDOM_SOURCE,
  THROWING_SOURCE,
} from './fixtures';
import { runPuppetWorker, type PuppetRunOptions, type PuppetRunResult } from './run';

let workDir = '';

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'puppet-run-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function run(source: string, options: PuppetRunOptions = {}): Promise<PuppetRunResult> {
  const compiled = await compilePuppetWorker({
    character: source,
    driver: DRIVER_SOURCE,
    determinism: DETERMINISM_SOURCE,
  });
  if (!compiled.ok) throw new Error(`fixture did not compile: ${JSON.stringify(compiled.issues)}`);
  return runPuppetWorker(compiled.code, workDir, options);
}

describe('runPuppetWorker', () => {
  it('bakes and audits the clean character, every gate green, feet measured', async () => {
    const result = await run(CLEAN_SOURCE);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { summary, rest, baked, reports } = result.result;
    expect(summary.canvasW).toBe(32);
    expect(summary.restFeetRow).toBe(summary.groundRow);
    expect(rest.w).toBe(32);
    expect(baked.get('idle')?.frames).toHaveLength(4);
    expect(reports).toHaveLength(1);
    expect(reports[0].failed, reports[0].checks.filter((c) => !c.ok).map((c) => c.text).join('; ')).toBe(0);
  });

  it('a missing buildCharacter export is a contract failure', async () => {
    const result = await run(MISSING_EXPORT_SOURCE);
    if (result.ok) throw new Error('ran without the export');
    expect(result.stage).toBe('contract');
    expect(result.issues[0].text).toContain('buildCharacter');
  });

  it('a throwing buildCharacter is a load failure carrying the message', async () => {
    const result = await run(THROWING_SOURCE);
    if (result.ok) throw new Error('a throwing build ran');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('deliberate failure from the fixture');
  });

  it('an impossible spec fails the contract with every problem named', async () => {
    const result = await run(BAD_CONTRACT_SOURCE);
    if (result.ok) throw new Error('an impossible spec ran');
    expect(result.stage).toBe('contract');
    const texts = result.issues.map((issue) => issue.text).join('\n');
    expect(texts).toContain('canvasW');
    expect(texts).toContain('Skeleton');
    expect(texts).toContain('restPose');
  });

  it('an infinite loop in buildCharacter ends as a structured timeout', async () => {
    const result = await run(HANGING_BUILD_SOURCE, { timeoutMs: 1500 });
    if (result.ok) throw new Error('a hang produced a character');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('too long');
  }, 20_000);

  it('an infinite loop inside a painter callback ends the same way', async () => {
    const result = await run(HANGING_PAINTER_SOURCE, { timeoutMs: 1500 });
    if (result.ok) throw new Error('a hanging painter produced a character');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('too long');
  }, 20_000);

  it('a microtask flood cannot outlive the bake — the result lands, the worker dies', async () => {
    const started = Date.now();
    const result = await run(ASYNC_FLOOD_SOURCE, { timeoutMs: 10_000 });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.result.reports[0].failed).toBe(0);
    // The flood must not hold the parent for the full deadline.
    expect(Date.now() - started).toBeLessThan(9_000);
  }, 20_000);

  it('unbounded allocation dies at the memory ceiling, named as such', async () => {
    const result = await run(MEMORY_HOG_SOURCE, { memoryMb: 48, timeoutMs: 20_000 });
    if (result.ok) throw new Error('a memory hog produced a character');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text.toLowerCase()).toContain('memory');
  }, 30_000);

  it('a random draw fails loudly — determinism is a contract', async () => {
    const result = await run(RANDOM_SOURCE);
    if (result.ok) throw new Error('a random character baked');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('deterministic');
  });

  it('every clock spelling is gone, not just Date.now', async () => {
    const result = await run(NEW_DATE_SOURCE);
    if (result.ok) throw new Error('a clock-reading character baked');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('deterministic');
  });

  it('an absurd Paint canvas dies at the engine allocation cap', async () => {
    const result = await run(GIANT_PAINT_SOURCE);
    if (result.ok) throw new Error('a giant paint baked');
    expect(result.stage).toBe('load');
    expect(result.issues[0].text).toContain('refusing');
  });
});
