import { describe, expect, it } from 'vitest';

import { DEFAULT_STATE, EMPTY_FILTERS, type ViewPreferences } from '../../shared/types';
import { mergeView, outstandingView, viewSignature } from './view-sync';

/**
 * The optimistic view must lead the persisted one and then get out of its way.
 * A key that is never retired keeps winning — including against values the
 * runtime chooses later, which is what silently disabled duplicate imports.
 */

const base: ViewPreferences = DEFAULT_STATE.view;

describe('retiring optimistic view keys', () => {
  it('keeps a key state has not caught up with', () => {
    expect(outstandingView({ query: 'grid' }, base)).toEqual({ query: 'grid' });
  });

  it('drops a key once state reports the same value', () => {
    expect(Object.keys(outstandingView({ query: 'grid' }, { ...base, query: 'grid' }))).toEqual([]);
  });

  it('drops an object key that state rebuilt with its keys in another order', () => {
    // `filters` makes a round trip through JSON and comes back structurally
    // equal but freshly built. Comparing by identity would pin it forever.
    const local = { filters: { ...EMPTY_FILTERS, tags: ['editorial'] } };
    const persisted: ViewPreferences = {
      ...base,
      filters: {
        analysisStatuses: [],
        sourceKinds: [],
        colourFamilies: [],
        tags: ['editorial'],
        styles: [],
        mediaKinds: [],
      },
    };
    expect(outstandingView(local, persisted)).toEqual({});
  });

  it('treats a different value in the same object as outstanding', () => {
    const local = { filters: { ...EMPTY_FILTERS, tags: ['editorial'] } };
    expect(outstandingView(local, base)).toEqual(local);
  });

  it('distinguishes a cleared selection from one state has not applied', () => {
    // `selectedItemId: undefined` is the value that used to stick. The key must
    // be *absent* once state agrees, not merely undefined — presence is what
    // makes the spread override a later value, so assert on the keys.
    const outstanding = outstandingView({ selectedItemId: undefined }, { ...base, selectedItemId: 'itm-1' });
    expect(Object.keys(outstanding)).toEqual(['selectedItemId']);
    expect(Object.keys(outstandingView({ selectedItemId: undefined }, base))).toEqual([]);
  });
});

describe('merging the view', () => {
  it('prefers a local value the runtime has not seen yet', () => {
    expect(mergeView({ sort: 'title' }, base).sort).toBe('title');
  });

  it('lets a later runtime selection through once the local one is spent', () => {
    // The sequence that broke: open an item, leave it, then re-import a
    // duplicate — the runtime selects the existing item and must be obeyed.
    const cleared = { selectedItemId: undefined };
    const acknowledged: ViewPreferences = { ...base };
    expect(outstandingView(cleared, acknowledged)).toEqual({});

    const runtimePicked: ViewPreferences = { ...base, selectedItemId: 'itm-existing' };
    expect(mergeView(outstandingView(cleared, acknowledged), runtimePicked).selectedItemId).toBe(
      'itm-existing',
    );
  });

  it('returns the persisted view untouched when nothing is local', () => {
    expect(mergeView(null, base)).toEqual(base);
  });
});

describe('the persisted-view signature', () => {
  it('is stable across rebuilds of an equal view', () => {
    expect(viewSignature({ ...base, filters: { ...EMPTY_FILTERS } })).toBe(viewSignature(base));
  });

  it('changes when any value changes', () => {
    expect(viewSignature({ ...base, query: 'grid' })).not.toBe(viewSignature(base));
  });
});

describe('clearing a selection', () => {
  it('treats null as a request to remove the key', () => {
    const persisted = { ...base, selectedItemId: 'itm-1' };

    // `undefined` cannot express this: JSON drops it, so the clear never
    // reaches the runtime and the old selection survives a restart.
    expect(mergeView({ selectedItemId: null }, persisted).selectedItemId).toBeUndefined();
  });

  it('keeps the clear outstanding until state catches up', () => {
    const persisted = { ...base, selectedItemId: 'itm-1' };

    expect(outstandingView({ selectedItemId: null }, persisted)).toEqual({ selectedItemId: null });
    // Once the runtime has applied it the key is retired, so a *later* selection
    // the runtime makes is not outranked by a stale local one.
    expect(outstandingView({ selectedItemId: null }, base)).toEqual({});
  });
});
