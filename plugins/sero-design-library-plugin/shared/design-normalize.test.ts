import { describe, expect, it } from 'vitest';

import { DEFAULT_VARIANTS, MAX_REFERENCES, orderedReferences, primaryReference, visibleRevision } from './design';
import { normalizeDesignRecord } from './design-normalize';

/**
 * Records outlive the code that wrote them. Same contract as item records: a
 * Design this version cannot read resolves to null so the caller skips it,
 * rather than handing back an object nobody has checked.
 */

function validDesign(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dsg-1',
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 2,
    title: 'A landing page',
    brief: {
      request: 'A pricing page',
      target: 'react',
      variationMode: 'blend',
      variantCount: 3,
      inspirationStrength: 'balanced',
    },
    references: [{ itemId: 'itm-1', order: 0 }],
    variants: [],
    appliedGuardrails: { always: [], never: [], resolved: [] },
    ...overrides,
  };
}

describe('reading a Design record', () => {
  it('accepts a well-formed one', () => {
    expect(normalizeDesignRecord(validDesign())?.id).toBe('dsg-1');
  });

  it('rejects one with no readable reference', () => {
    // A brief with nothing to draw on cannot be regenerated or explained.
    expect(normalizeDesignRecord(validDesign({ references: [] }))).toBeNull();
    expect(normalizeDesignRecord(validDesign({ references: [{ order: 0 }] }))).toBeNull();
  });

  it('rejects one with no id', () => {
    expect(normalizeDesignRecord(validDesign({ id: '' }))).toBeNull();
    expect(normalizeDesignRecord(null)).toBeNull();
  });

  it('falls back to sane defaults for a malformed brief', () => {
    const design = normalizeDesignRecord(validDesign({ brief: 'not an object' }));

    expect(design?.brief.target).toBe('react');
    expect(design?.brief.variantCount).toBe(DEFAULT_VARIANTS);
    expect(design?.brief.inspirationStrength).toBe('balanced');
  });

  it('clamps a variant count outside the allowed range', () => {
    const high = normalizeDesignRecord(validDesign({ brief: { variantCount: 99 } }));
    const low = normalizeDesignRecord(validDesign({ brief: { variantCount: 0 } }));

    expect(high?.brief.variantCount).toBe(5);
    expect(low?.brief.variantCount).toBe(1);
  });

  it('enforces the reference cap as a storage invariant', () => {
    const many = Array.from({ length: 10 }, (_unused, index) => ({ itemId: `itm-${index}`, order: index }));

    expect(normalizeDesignRecord(validDesign({ references: many }))?.references).toHaveLength(
      MAX_REFERENCES,
    );
  });

  it('keeps a tombstone so a purged reference can still be explained', () => {
    const design = normalizeDesignRecord(
      validDesign({
        references: [
          {
            itemId: 'itm-gone',
            order: 0,
            tombstone: { itemId: 'itm-gone', title: 'Old shot', deletedAt: 5 },
          },
        ],
      }),
    );

    expect(design?.references[0]?.tombstone?.title).toBe('Old shot');
  });
});

describe('reading variants and revisions', () => {
  it('drops a revision with no files', () => {
    // It cannot render, and it would sit in the revision selector as an empty
    // entry that does nothing when chosen.
    const design = normalizeDesignRecord(
      validDesign({
        variants: [
          {
            id: 'var-1',
            index: 0,
            status: 'ready',
            attempts: 1,
            revisions: [
              { id: 'rev-1', files: [{ name: 'index.html', bytes: 8 }], createdAt: 1, summary: 'one' },
              { id: 'rev-2', createdAt: 2, summary: 'two' },
            ],
          },
        ],
      }),
    );

    expect(design?.variants[0]?.revisions.map((revision) => revision.id)).toEqual(['rev-1']);
  });

  it('drops a visible-revision pointer that no longer resolves', () => {
    const design = normalizeDesignRecord(
      validDesign({
        variants: [
          {
            id: 'var-1',
            index: 0,
            status: 'ready',
            attempts: 1,
            visibleRevisionId: 'rev-missing',
            revisions: [
              { id: 'rev-1', files: [{ name: 'index.html', bytes: 8 }], createdAt: 1, summary: 'one' },
            ],
          },
        ],
      }),
    );

    expect(design?.variants[0]?.visibleRevisionId).toBeUndefined();
  });

  it('treats an unknown variant status as pending', () => {
    const design = normalizeDesignRecord(
      validDesign({ variants: [{ id: 'var-1', index: 0, status: 'exploded', attempts: 0 }] }),
    );

    expect(design?.variants[0]?.status).toBe('pending');
  });
});

describe('reading a Design', () => {
  it('sorts references by order rather than stored position', () => {
    const design = normalizeDesignRecord(
      validDesign({
        references: [
          { itemId: 'itm-second', order: 1 },
          { itemId: 'itm-first', order: 0 },
        ],
      }),
    );

    expect(orderedReferences(design!).map((reference) => reference.itemId)).toEqual([
      'itm-first',
      'itm-second',
    ]);
    expect(primaryReference(design!)?.itemId).toBe('itm-first');
  });

  it('falls back to the newest revision when the pointer is gone', () => {
    // Something on screen beats an empty pane.
    const variant = {
      id: 'var-1',
      index: 0,
      status: 'ready' as const,
      attempts: 1,
      revisions: [
        { id: 'rev-1', jobId: 'job-1', files: [], buildWarnings: [], createdAt: 1, summary: '', name: '' },
        { id: 'rev-2', jobId: 'job-2', files: [], buildWarnings: [], createdAt: 2, summary: '', name: '' },
      ],
    };

    expect(visibleRevision(variant)?.id).toBe('rev-2');
    expect(visibleRevision({ ...variant, visibleRevisionId: 'rev-1' })?.id).toBe('rev-1');
  });
});
