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

  it('names every audit gate the engine can fire', () => {
    const ids: engine.AuditCheckId[] = [
      'valid',
      'distinct',
      'wrap',
      'islands',
      'in-place',
      'baseline',
      'edge',
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
