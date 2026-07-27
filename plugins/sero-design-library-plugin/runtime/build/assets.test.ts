import { describe, expect, it } from 'vitest';

import { buildPreviewDocument } from './index';
import { inlineAssets, referencedAssets, type BuildAsset } from './assets';

function asset(reference: string, byteLength = 4): BuildAsset {
  return { reference, bytes: new Uint8Array(byteLength).fill(1), mediaType: 'image/png' };
}

describe('referencedAssets', () => {
  it('finds references wherever the page happened to put them', () => {
    const document = [
      '<img src="assets/a.png">',
      '<style>.hero { background: url(assets/b.png); }</style>',
      '<script>const art = "assets/c.png";</script>',
    ].join('\n');

    // One pass over the finished document, because a model uses whichever of
    // the three suits it and a per-file pass would miss the other two.
    expect(referencedAssets(document).toSorted()).toEqual([
      'assets/a.png',
      'assets/b.png',
      'assets/c.png',
    ]);
  });

  it('reports each reference once however often it appears', () => {
    expect(referencedAssets('<img src="assets/a.png"><img src="assets/a.png">')).toEqual([
      'assets/a.png',
    ]);
  });
});

describe('inlineAssets', () => {
  it('replaces every occurrence with a data uri', () => {
    const { document, warnings } = inlineAssets(
      '<img src="assets/a.png"><div style="background:url(assets/a.png)"></div>',
      [asset('assets/a.png')],
    );

    expect(document).not.toContain('assets/a.png');
    expect([...document.matchAll(/data:image\/png;base64,/g)]).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it('substitutes a local placeholder when the artwork is missing', () => {
    const { document, warnings } = inlineAssets('<img src="assets/gone.png">', []);

    // A failed or deleted asset must not leave a live reference behind: the
    // preview has no network, so it would paint a broken-image icon.
    expect(document).not.toContain('assets/gone.png');
    expect(document).toContain('data:image/svg+xml;base64,');
    expect(warnings[0]).toMatch(/retry it in the asset tray/i);
  });

  it('refuses to embed something too large, and says the export still has it', () => {
    const { document, warnings } = inlineAssets('<video src="assets/clip.mp4">', [
      { reference: 'assets/clip.mp4', bytes: new Uint8Array(13 * 1024 * 1024), mediaType: 'video/mp4' },
    ]);

    expect(document).toContain('data:image/svg+xml;base64,');
    expect(warnings[0]).toMatch(/too large to embed/i);
    expect(warnings[0]).toMatch(/export carries the real file/i);
  });

  it('leaves a document with no references untouched', () => {
    const document = '<p>Nothing to see</p>';
    expect(inlineAssets(document, [asset('assets/a.png')]).document).toBe(document);
  });

  it('does not let a reference be confused for a longer one', () => {
    const { document } = inlineAssets('<img src="assets/a.png"><img src="assets/a.png.bak">', [
      asset('assets/a.png'),
      { reference: 'assets/a.png.bak', bytes: new Uint8Array([9]), mediaType: 'image/webp' },
    ]);

    // Both resolve to their own bytes. A substring replacement would have
    // rewritten the first half of the second reference and left `.bak` dangling.
    expect(document).toContain('data:image/webp;base64,');
    expect(document).not.toContain('assets/');
  });
});

describe('buildPreviewDocument with assets', () => {
  it('folds generated artwork into the html target', async () => {
    const built = await buildPreviewDocument(
      'html',
      [{ name: 'index.html', content: '<body><img src="assets/hero.png"></body>' }],
      { assets: [asset('assets/hero.png')] },
    );

    expect(built.document).toContain('data:image/png;base64,');
    // No remote URL, and no unresolved local path: the document is self-contained.
    expect(built.document).not.toContain('assets/hero.png');
  });

  it('warns about artwork the page wanted and never got', async () => {
    const built = await buildPreviewDocument(
      'html',
      [{ name: 'index.html', content: '<body><img src="assets/hero.png"></body>' }],
      { assets: [] },
    );

    expect(built.document).toBeDefined();
    // The page still renders — a missing image is not a reason to have no page.
    expect(built.warnings.some((warning) => warning.includes('assets/hero.png'))).toBe(true);
  });
});
