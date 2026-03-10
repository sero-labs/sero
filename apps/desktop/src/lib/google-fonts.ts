/**
 * google-fonts.ts — dynamically load Google Fonts via <link> injection.
 *
 * When the user selects a web font in the theme editor, we inject a
 * Google Fonts stylesheet into <head>. Already-loaded fonts are tracked
 * to avoid duplicate requests.
 */

/** Set of font family names that have already been injected. */
const loadedFonts = new Set<string>();

/**
 * Map of font family names to their Google Fonts identifiers.
 * Only fonts in this map will be loaded via Google Fonts CDN.
 * Fonts not in this map (system fonts, macOS-native) are used as-is.
 */
const GOOGLE_FONT_MAP: Record<string, string> = {
  'Inter': 'Inter:wght@300;400;500;600;700',
  'Geist': 'Geist:wght@300;400;500;600;700',
  'Source Sans 3': 'Source+Sans+3:wght@300;400;500;600;700',
  'IBM Plex Sans': 'IBM+Plex+Sans:wght@300;400;500;600;700',
  'Fira Code': 'Fira+Code:wght@300;400;500;600;700',
  'JetBrains Mono': 'JetBrains+Mono:wght@300;400;500;600;700',
  'Source Code Pro': 'Source+Code+Pro:wght@300;400;500;600;700',
  'IBM Plex Mono': 'IBM+Plex+Mono:wght@300;400;500;600;700',
  'Cascadia Code': 'Cascadia+Code:wght@300;400;500;600;700',
};

/**
 * Extract the primary font family name from a CSS font stack.
 * e.g. "'Inter', system-ui, sans-serif" → "Inter"
 */
function extractPrimaryFont(stack: string): string | null {
  const first = stack.split(',')[0]?.trim();
  if (!first) return null;
  // Strip quotes
  return first.replace(/^['"]|['"]$/g, '');
}

/**
 * Load a Google Font by injecting a <link> tag into <head>.
 * No-op if the font is already loaded or not in the Google Fonts map.
 */
export function loadGoogleFont(fontStack: string): void {
  const primary = extractPrimaryFont(fontStack);
  if (!primary) return;
  if (loadedFonts.has(primary)) return;

  const googleId = GOOGLE_FONT_MAP[primary];
  if (!googleId) return; // System font — no loading needed

  loadedFonts.add(primary);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleId}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Preload all Google Fonts used in the preset lists so they're available
 * immediately when browsing the font picker.
 */
export function preloadAllGoogleFonts(): void {
  for (const googleId of Object.values(GOOGLE_FONT_MAP)) {
    const family = googleId.split(':')[0]?.replace(/\+/g, ' ');
    if (family && !loadedFonts.has(family)) {
      loadedFonts.add(family);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${googleId}&display=swap`;
      document.head.appendChild(link);
    }
  }
}
