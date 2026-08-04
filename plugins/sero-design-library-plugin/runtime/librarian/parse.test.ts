import { describe, expect, it } from 'vitest';

import { clampAnalysis, extractJson, parseAnalysis, validateAnalysis } from './parse';

const VALID = {
  title: 'Northstar operations',
  primaryStyle: 'Technical monochrome',
  designTypes: ['dashboard'],
  tags: ['data-dense', 'precise', 'emerald', 'mono', 'grid', 'dark'],
  summary: 'A severe operations interface that makes complex activity feel controlled.',
  designIntent: 'Make dense activity legible at a glance.',
  aestheticVocabulary: [{ term: 'monolithic', meaning: 'single heavy plane' }],
  visualProfile: { colour: ['near-black'], typography: ['overscale grotesk'] },
  palette: [{ hex: '#0B0B0D', role: 'background' }],
  always: ['Reserve the accent for state'],
  never: ['Decorative gradients'],
  generationPrompt: Array.from({ length: 100 }, () => 'word').join(' '),
  confidence: 0.9,
};

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('reads a fenced object', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('reads an object wrapped in prose', () => {
    expect(extractJson('Sure! {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it('returns null when there is no object at all', () => {
    expect(extractJson('I could not see the image.')).toBeNull();
  });
});

describe('parseAnalysis', () => {
  it('shapes a valid reply into the domain type', () => {
    const parsed = parseAnalysis(JSON.stringify(VALID));
    expect(parsed).not.toBeNull();
    expect(parsed?.analysis.primaryStyle).toBe('Technical monochrome');
    expect(parsed?.analysis.visualProfile.motion).toEqual([]);
    expect(parsed?.confidence).toBe(0.9);
  });

  it('always leaves generated notes empty', () => {
    const parsed = parseAnalysis(JSON.stringify({ ...VALID, notes: 'model wrote notes' }));
    expect(parsed?.analysis.notes).toBe('');
  });

  it('drops palette entries that are not colours', () => {
    const parsed = parseAnalysis(
      JSON.stringify({ ...VALID, palette: [{ hex: 'not-a-colour', role: 'x' }, { hex: '#ABC', role: 'y' }] }),
    );
    expect(parsed?.analysis.palette).toEqual([{ hex: '#abc', role: 'y' }]);
  });

  it('accepts vocabulary given as plain strings', () => {
    const parsed = parseAnalysis(JSON.stringify({ ...VALID, aestheticVocabulary: ['terse', 'exact'] }));
    expect(parsed?.analysis.aestheticVocabulary).toEqual([{ term: 'terse' }, { term: 'exact' }]);
  });

  it('returns null when the reply is not JSON', () => {
    expect(parseAnalysis('I cannot analyse this.')).toBeNull();
  });
});

describe('validateAnalysis', () => {
  it('accepts a reply that meets every content limit', () => {
    const parsed = parseAnalysis(JSON.stringify(VALID));
    expect(parsed && validateAnalysis(parsed.analysis)).toEqual([]);
  });

  it('reports too few tags', () => {
    const parsed = parseAnalysis(JSON.stringify({ ...VALID, tags: ['one'] }));
    expect(parsed && validateAnalysis(parsed.analysis)).toContainEqual(expect.stringContaining('`tags`'));
  });

  it('reports a generation prompt outside the word range', () => {
    const parsed = parseAnalysis(JSON.stringify({ ...VALID, generationPrompt: 'too short' }));
    expect(parsed && validateAnalysis(parsed.analysis)).toContainEqual(
      expect.stringContaining('`generationPrompt`'),
    );
  });

  it('reports an over-full visual group', () => {
    const parsed = parseAnalysis(
      JSON.stringify({ ...VALID, visualProfile: { colour: ['a', 'b', 'c', 'd', 'e'] } }),
    );
    expect(parsed && validateAnalysis(parsed.analysis)).toContainEqual(
      expect.stringContaining('visualProfile.colour'),
    );
  });
});

describe('clampAnalysis', () => {
  it('trims over-long lists so an unrepaired reply is still usable', () => {
    const parsed = parseAnalysis(
      JSON.stringify({
        ...VALID,
        tags: Array.from({ length: 30 }, (_, index) => `tag${index}`),
        visualProfile: { colour: ['a', 'b', 'c', 'd', 'e', 'f'] },
        always: ['1', '2', '3', '4', '5', '6', '7'],
      }),
    );
    const clamped = clampAnalysis(parsed!.analysis);

    expect(clamped.tags).toHaveLength(12);
    expect(clamped.visualProfile.colour).toHaveLength(4);
    expect(clamped.always).toHaveLength(5);
  });
});
