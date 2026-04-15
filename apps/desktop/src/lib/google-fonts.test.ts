// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

function getGoogleFamilyIds(): string[] {
  return Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => {
      const href = link.getAttribute('href') ?? '';
      const match = href.match(/family=([^&]+)/);
      return match?.[1] ?? '';
    })
    .filter(Boolean);
}

describe('google-fonts', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
  });

  it('preloads only the curated popular font subset', async () => {
    const { preloadAllGoogleFonts } = await import('./google-fonts');

    preloadAllGoogleFonts();

    expect(getGoogleFamilyIds()).toEqual([
      'Inter:wght@300;400;500;600;700',
      'Geist:wght@300;400;500;600;700',
      'Roboto:wght@300;400;500;700',
      'Open+Sans:wght@300;400;500;600;700',
      'JetBrains+Mono:wght@300;400;500;600;700',
      'Fira+Code:wght@300;400;500;600;700',
      'Source+Code+Pro:wght@300;400;500;600;700',
      'IBM+Plex+Sans:wght@300;400;500;600;700',
      'IBM+Plex+Mono:wght@300;400;500;600;700',
    ]);
  });

  it('deduplicates preloaded and on-demand font loads', async () => {
    const { loadGoogleFont, preloadAllGoogleFonts } = await import('./google-fonts');

    preloadAllGoogleFonts();
    preloadAllGoogleFonts();
    loadGoogleFont("'Inter', system-ui, sans-serif");

    expect(getGoogleFamilyIds().filter((family) => family.startsWith('Inter:'))).toHaveLength(1);
    expect(getGoogleFamilyIds()).toHaveLength(9);
  });

  it('loads non-preloaded mapped fonts on demand', async () => {
    const { loadGoogleFont, preloadAllGoogleFonts } = await import('./google-fonts');

    preloadAllGoogleFonts();
    loadGoogleFont("'Manrope', system-ui, sans-serif");

    expect(getGoogleFamilyIds()).toContain('Manrope:wght@300;400;500;600;700');
  });

  it('ignores unknown or system-only font stacks', async () => {
    const { loadGoogleFont } = await import('./google-fonts');

    loadGoogleFont('system-ui, sans-serif');
    loadGoogleFont("'Not In Google Map', sans-serif");

    expect(getGoogleFamilyIds()).toEqual([]);
  });
});
