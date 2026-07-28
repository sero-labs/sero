import { describe, expect, it } from 'vitest';

import type { DesignAsset } from '../../shared/media';
import { emptyAnalysis } from '../../shared/librarian';
import { TEST_BRIEF } from '../test-fixtures';
import { buildGenerationTask } from './prompt';

/**
 * What the run is told about artwork.
 *
 * The load-bearing case is a *resumed* run. A generation that restarts is a
 * fresh conversation — the model has no memory of the tool calls it already
 * made — so unless the prompt names the artwork already in the tray, it asks for
 * the same hero image again and it is paid for twice.
 */

function asset(overrides: Partial<DesignAsset> = {}): DesignAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    reference: 'assets/asset-1.png',
    request: { capability: 'text-to-image', prompt: 'A dark metallic hero surface' },
    attempts: [{ id: 'a1', outcome: 'ready', startedAt: 0, completedAt: 1, file: 'art.png' }],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const BASE = {
  brief: TEST_BRIEF,
  variant: { index: 0, id: 'variant-1' },
  variantCount: 1,
  references: [{ itemId: 'item-1', order: 0, analysis: emptyAnalysis('Northstar') }],
  guardrails: { always: [], never: [] },
} as unknown as Parameters<typeof buildGenerationTask>[0];

describe('artwork the Design already has', () => {
  it('names it, so a resumed run reuses it rather than paying again', () => {
    const prompt = buildGenerationTask({
      ...BASE,
      mediaAvailable: true,
      existingAssets: [asset()],
    });

    expect(prompt).toContain('assets/asset-1.png');
    expect(prompt).toContain('A dark metallic hero surface');
    expect(prompt).toContain('already has artwork');
  });

  it('offers it even when this run may not generate any more', () => {
    // The cap is spent, or there is no key. The page can still point at what is
    // already there — telling it "no imagery" would waste artwork already paid
    // for and leave a hole where the focal point should be.
    const prompt = buildGenerationTask({
      ...BASE,
      mediaAvailable: false,
      existingAssets: [asset()],
    });

    expect(prompt).toContain('assets/asset-1.png');
    expect(prompt).toContain('cannot generate new imagery');
  });

  it('does not offer artwork that failed or was deleted', () => {
    const prompt = buildGenerationTask({
      ...BASE,
      mediaAvailable: true,
      existingAssets: [
        asset({ id: 'failed', reference: 'assets/failed.png', attempts: [] }),
        asset({ id: 'gone', reference: 'assets/gone.png', deletedAt: 1 }),
      ],
    });

    // A reference to either resolves to nothing in the preview.
    expect(prompt).not.toContain('assets/failed.png');
    expect(prompt).not.toContain('assets/gone.png');
  });

  it('says nothing extra when there is no artwork yet', () => {
    const prompt = buildGenerationTask({ ...BASE, mediaAvailable: true, existingAssets: [] });

    expect(prompt).not.toContain('already has artwork');
    expect(prompt).toContain('You can generate illustrative artwork');
  });
});
