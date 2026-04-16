/**
 * google-fonts.ts — dynamically load Google Fonts via <link> injection.
 *
 * When the user selects a web font in the theme editor, we inject a
 * Google Fonts stylesheet into <head>. Already-loaded fonts are tracked
 * to avoid duplicate requests.
 */

/** Set of font family names whose stylesheet has been injected. */
const loadedFonts = new Set<string>();

/**
 * Curated subset preloaded for the font picker so common fonts render fast
 * without eagerly loading every Google family in the catalog.
 */
const POPULAR_PRELOAD_FAMILIES = [
  'Inter',
  'Geist',
  'Roboto',
  'Open Sans',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Sans',
  'IBM Plex Mono',
] as const;

/**
 * Map of font family names → Google Fonts CSS2 API family strings.
 * Only fonts in this map are loaded from the CDN; others (system fonts)
 * are used as-is without any network request.
 */
const GOOGLE_FONT_MAP: Record<string, string> = {
  // ── Sans-serif ──
  'Inter': 'Inter:wght@300;400;500;600;700',
  'Geist': 'Geist:wght@300;400;500;600;700',
  'Roboto': 'Roboto:wght@300;400;500;700',
  'Open Sans': 'Open+Sans:wght@300;400;500;600;700',
  'Lato': 'Lato:wght@300;400;700',
  'Montserrat': 'Montserrat:wght@300;400;500;600;700',
  'Poppins': 'Poppins:wght@300;400;500;600;700',
  'Nunito': 'Nunito:wght@300;400;500;600;700',
  'Raleway': 'Raleway:wght@300;400;500;600;700',
  'Source Sans 3': 'Source+Sans+3:wght@300;400;500;600;700',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@300;400;500;600;700',
  'DM Sans': 'DM+Sans:wght@300;400;500;600;700',
  'Work Sans': 'Work+Sans:wght@300;400;500;600;700',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@300;400;500;600;700',
  'Manrope': 'Manrope:wght@300;400;500;600;700',
  'Space Grotesk': 'Space+Grotesk:wght@300;400;500;600;700',
  'Outfit': 'Outfit:wght@300;400;500;600;700',
  'Rubik': 'Rubik:wght@300;400;500;600;700',
  'Karla': 'Karla:wght@300;400;500;600;700',

  // ── Monospace ──
  'JetBrains Mono': 'JetBrains+Mono:wght@300;400;500;600;700',
  'Fira Code': 'Fira+Code:wght@300;400;500;600;700',
  'Source Code Pro': 'Source+Code+Pro:wght@300;400;500;600;700',
  'IBM Plex Mono': 'IBM+Plex+Mono:wght@300;400;500;600;700',
  'Cascadia Code': 'Cascadia+Code:wght@300;400;500;600;700',
  'Roboto Mono': 'Roboto+Mono:wght@300;400;500;600;700',
  'Space Mono': 'Space+Mono:wght@400;700',
  'Inconsolata': 'Inconsolata:wght@300;400;500;600;700',
  'DM Mono': 'DM+Mono:wght@300;400;500',
  'Ubuntu Mono': 'Ubuntu+Mono:wght@400;700',
};

/**
 * Extract the primary font family name from a CSS font stack.
 * e.g. "'Inter', system-ui, sans-serif" → "Inter"
 */
function extractPrimaryFont(stack: string): string | null {
  const first = stack.split(',')[0]?.trim();
  if (!first) return null;
  return first.replace(/^['"]|['"]$/g, '');
}

/**
 * Load a Google Font by injecting a <link> into <head>.
 * No-op if already loaded or not in the Google Fonts map.
 */
function appendGoogleFontLink(googleId: string): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleId}&display=swap`;
  document.head.appendChild(link);
}

function loadGoogleFamily(family: string): void {
  if (loadedFonts.has(family)) return;
  const googleId = GOOGLE_FONT_MAP[family];
  if (!googleId) return;

  loadedFonts.add(family);
  appendGoogleFontLink(googleId);
}

export function loadGoogleFont(fontStack: string): void {
  const primary = extractPrimaryFont(fontStack);
  if (!primary) return;
  loadGoogleFamily(primary);
}

/**
 * Preload a curated subset of popular fonts for the picker. Less common
 * families continue to load on demand via `loadGoogleFont()`.
 */
export function preloadAllGoogleFonts(): void {
  for (const family of POPULAR_PRELOAD_FAMILIES) {
    loadGoogleFamily(family);
  }
}
