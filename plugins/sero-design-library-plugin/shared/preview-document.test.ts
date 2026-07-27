import { describe, expect, it } from 'vitest';
import {
  PREVIEW_CSP,
  buildDeterministicPreviewDocument,
  buildPreviewDocument,
  buildStandaloneDocument,
  inlineAssetReferences,
} from './preview-document';
import type { TweakManifest } from './tweak-types';

const manifest: TweakManifest = {
  schemaVersion: 1,
  variantRevisionId: 'rev-1',
  controls: [{
    id: 'gap',
    group: 'Spacing',
    label: 'Gap',
    cssVariable: '--gap',
    control: { type: 'range', min: 0, max: 4, step: 1, unit: 'rem' },
    defaultValue: 1,
  }],
};

const base = {
  title: 'Test design',
  bodyHtml: '<main><img src="assets/a1/hero.png" alt=""></main>',
  css: ':root { --gap: 1rem; }',
  assets: [{ path: 'assets/a1/hero.png', mimeType: 'image/png', data: 'AAAA' }],
  manifest,
};

describe('buildPreviewDocument', () => {
  const html = buildPreviewDocument({ ...base, js: 'console.log(1)' });

  it('blocks every network source through the CSP', () => {
    expect(html).toContain(PREVIEW_CSP);
    expect(PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREVIEW_CSP).toContain("connect-src 'none'");
    expect(PREVIEW_CSP).toContain("frame-src 'none'");
  });

  it('inlines local assets so the opaque origin needs no filesystem', () => {
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).not.toContain('assets/a1/hero.png');
  });

  it('carries the manifest and the guard harness into the frame', () => {
    expect(html).toContain('window.__SERO_TWEAKS__');
    expect(html).toContain('sero-design-library-preview');
  });

  it('escapes a closing script tag inside generated code', () => {
    const escaped = buildPreviewDocument({ ...base, js: 'var x = "</script>";' });
    expect(escaped).not.toContain('"</script>"');
    expect(escaped).toContain('<\\/script>');
  });
});

describe('buildStandaloneDocument', () => {
  it('bakes the effective values in and carries no Sero runtime', () => {
    const html = buildStandaloneDocument({ ...base, values: { gap: 3 } });
    expect(html).toContain('--gap: 3rem;');
    expect(html).not.toContain('__SERO_TWEAKS__');
    expect(html).not.toContain('sero-design-library-preview');
  });
});

describe('buildDeterministicPreviewDocument', () => {
  it('removes scripts and motion so two renders match', () => {
    const html = buildDeterministicPreviewDocument({
      ...base,
      js: 'document.title = Date.now()',
      values: {},
    });
    expect(html).not.toContain('Date.now()');
    expect(html).toContain('animation:none!important');
    expect(html).toBe(buildDeterministicPreviewDocument({ ...base, js: 'x', values: {} }));
  });
});

describe('inlineAssetReferences', () => {
  it('replaces every reference spelling', () => {
    const replaced = inlineAssetReferences(
      'a: url(assets/a1/hero.png) b: url(./assets/a1/hero.png) c: url(/assets/a1/hero.png)',
      base.assets,
    );
    expect(replaced).not.toContain('assets/a1/hero.png');
    expect(replaced.match(/data:image\/png/g)).toHaveLength(3);
  });
});
