/**
 * What the inspector can show for a run (spec architect-run-observability).
 *
 * A pending answer is not an empty run, and an empty run is said once in words
 * instead of being drawn as tiles and charts full of zeros.
 */

import { describe, expect, it } from 'vitest';
import { inspectorPhase } from '../lib/run-state';
import { activity, node, tracePage } from './trace-fixture';

describe('the inspector phase', () => {
  it('is loading until an answer arrives, not empty', () => {
    expect(inspectorPhase({ loading: true, page: null })).toBe('loading');
  });

  it('is empty when the runtime found no journal for the run', () => {
    expect(inspectorPhase({ loading: false, page: tracePage({ recorded: false }) })).toBe('empty');
  });

  it('is empty when the journal holds no activity and no cost', () => {
    expect(inspectorPhase({ loading: false, page: tracePage() })).toBe('empty');
  });

  it('is ready as soon as the run has one named activity', () => {
    expect(inspectorPhase({ loading: false, page: tracePage({ activity: activity([node('owner')]) }) })).toBe('ready');
  });
});
