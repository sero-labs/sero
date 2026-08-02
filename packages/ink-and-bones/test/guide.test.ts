/**
 * The authoring guide is system material for a model that cannot read the
 * engine source — a truncated or drifted guide poisons every authoring run
 * silently. Pin that it ships whole and teaches symbols that really exist.
 */
import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';
import { AUTHORING_GUIDE, ENGINE_VERSION } from '../src/index';

describe('authoring guide', () => {
  it('ships whole', () => {
    expect(AUTHORING_GUIDE.length).toBeGreaterThan(5000);
    expect(AUTHORING_GUIDE.startsWith('# Ink & Bones'));
    expect(AUTHORING_GUIDE.trimEnd().endsWith('one you made.')).toBe(true);
  });

  it('teaches only exported API names', () => {
    for (const name of ['Motion', 'Paint', 'Skeleton', 'hex']) {
      expect(AUTHORING_GUIDE).toContain(name);
      expect(engine).toHaveProperty(name);
    }
    // Load-bearing vocabulary the loop's feedback refers back to.
    for (const term of [
      'buildCharacter',
      'CharacterSpec',
      'groundRow',
      'wobbleBudget',
      'airborne',
      'solveChain',
      'Motion.mirror',
      'emissiveLone',
      'restPose',
    ]) {
      expect(AUTHORING_GUIDE).toContain(term);
    }
  });

  it('teaches the proportions that actually read, not life drawing', () => {
    // The old text told the author the head must be "visibly narrower than
    // the shoulders". Measured, that produced a head 0.43 of the body width
    // and an unreadable figure; the working reference character's head is
    // 0.80. Pin the corrected advice so it cannot drift back.
    expect(AUTHORING_GUIDE).toContain('AS WIDE AS THE TORSO');
    expect(AUTHORING_GUIDE).not.toContain('narrower than the shoulders');
    expect(AUTHORING_GUIDE).toContain('FILL THE CANVAS');
    expect(AUTHORING_GUIDE).toContain('IN PROFILE');
  });

  it('shows the exact signatures of the helpers that used to fail silently', () => {
    for (const signature of [
      'p.stroke(points, widths, colour)',
      'p.occludeAbove(atY, depth, amount)',
      'p.polygon(points, colour)',
      'shadow: { x: 56, y: 140, rx: 22, ry: 4 }',
    ]) {
      expect(AUTHORING_GUIDE).toContain(signature);
    }
  });

  it('names every audit gate the engine can fire', () => {
    const ids: engine.AuditCheckId[] = [
      'valid',
      'distinct',
      'wrap',
      'islands',
      'in-place',
      'baseline',
      'edge',
      'fill',
      'speckle',
      'ramp',
    ];
    for (const id of ids) expect(AUTHORING_GUIDE).toContain(`- ${id} `);
  });

  it('version matches package.json', async () => {
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});
