/** Fonts offered by the two guaranteed typography controls. */
export const DESIGN_FONT_OPTIONS = [
  { label: 'System Sans', value: 'system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif', googleFamily: 'Inter:wght@300;400;500;600;700;800' },
  { label: 'Geist', value: 'Geist, system-ui, sans-serif', googleFamily: 'Geist:wght@300;400;500;600;700;800' },
  { label: 'Space Grotesk', value: 'Space Grotesk, system-ui, sans-serif', googleFamily: 'Space+Grotesk:wght@300;400;500;600;700' },
  { label: 'IBM Plex Sans', value: 'IBM Plex Sans, system-ui, sans-serif', googleFamily: 'IBM+Plex+Sans:wght@300;400;500;600;700' },
  { label: 'System Mono', value: 'ui-monospace, monospace' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, ui-monospace, monospace', googleFamily: 'JetBrains+Mono:wght@300;400;500;600;700' },
  { label: 'IBM Plex Mono', value: 'IBM Plex Mono, ui-monospace, monospace', googleFamily: 'IBM+Plex+Mono:wght@300;400;500;600;700' },
] as const;

export type DesignFontValue = (typeof DESIGN_FONT_OPTIONS)[number]['value'];

export function googleFontStylesheet(fontStack: string): string | null {
  const option = DESIGN_FONT_OPTIONS.find((entry) => entry.value === fontStack);
  return option && 'googleFamily' in option
    ? `https://fonts.googleapis.com/css2?family=${option.googleFamily}&display=swap`
    : null;
}
