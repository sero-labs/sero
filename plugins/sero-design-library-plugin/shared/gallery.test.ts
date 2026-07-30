import { describe, expect, it } from 'vitest';

import { normalizeGalleryFamily, normalizeGalleryVersion } from './gallery';

const VERSION = {
  id: 'ver-1',
  schemaVersion: 1,
  familyId: 'fam-1',
  createdAt: 1,
  title: 'Signals',
  name: 'Signal Ledger',
  summary: 'A signal dashboard.',
  target: 'html',
  sourceDesignId: 'dsn-1',
  sourceVariantId: 'var-1',
  sourceRevisionId: 'rev-1',
  sourceJobId: 'job-1',
  files: [{ name: 'index.html', bytes: 10, checksum: 'abc' }],
  assets: [],
  previewFile: 'preview.png',
  previewBytes: 20,
  previewChecksum: 'def',
  brief: {
    request: 'Build signals', target: 'html', variationMode: 'blend',
    variantCount: 1, inspirationStrength: 'balanced',
  },
  guardrails: { always: ['Keep it clear'], never: [], session: [], resolved: [] },
  references: [{ itemId: 'itm-1', order: 0, title: 'Reference' }],
  tweakOverrides: {},
  effectiveTweakValues: {},
  dependencyManifest: [],
};

describe('Gallery record validation', () => {
  it('refuses source and asset paths that escape the immutable version', () => {
    expect(normalizeGalleryVersion({
      ...VERSION,
      files: [{ name: '../secret', bytes: 10, checksum: 'abc' }],
    })).toBeNull();
    expect(normalizeGalleryVersion({
      ...VERSION,
      assets: [{
        id: 'asset-1', reference: 'assets/art.image', file: '../art.png',
        mediaType: 'image/png', bytes: 10, checksum: 'abc',
        request: { capability: 'text-to-image', prompt: 'art' },
      }],
    })).toBeNull();
  });

  it('repairs a missing featured pointer to the newest stored version', () => {
    const family = normalizeGalleryFamily({
      id: 'fam-1', sourceDesignId: 'dsn-1', title: 'Signals', featuredVersionId: 'missing',
      versions: [
        {
          id: 'ver-1', createdAt: 1, title: 'First', target: 'html',
          sourceVariantId: 'var-1', sourceRevisionId: 'rev-1', previewFile: 'preview.png',
        },
        {
          id: 'ver-2', createdAt: 2, title: 'Second', target: 'html',
          sourceVariantId: 'var-1', sourceRevisionId: 'rev-2', previewFile: 'preview.png',
        },
      ],
    });
    expect(family?.featuredVersionId).toBe('ver-2');
  });
});
