import { DESIGN_FONT_OPTIONS, googleFontStylesheet } from '../../shared/fonts';

const loaded = new Set<string>();

export function loadDesignFont(fontStack: string): void {
  const href = googleFontStylesheet(fontStack);
  if (href === null || loaded.has(href)) return;
  loaded.add(href);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function preloadDesignFonts(): void {
  for (const option of DESIGN_FONT_OPTIONS) loadDesignFont(option.value);
}
