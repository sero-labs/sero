export interface DesignFontFace {
  /** Stable id shared by the bundled UI asset and the preview harness. */
  id: string;
  family: string;
  weight: string;
}

/** Fonts offered by the two guaranteed typography controls. */
export const DESIGN_FONT_OPTIONS = [
  { label: 'System Sans', value: 'system-ui, sans-serif' },
  {
    label: 'Inter',
    value: 'Inter, system-ui, sans-serif',
    faces: [{ id: 'inter-latin', family: 'Inter', weight: '300 800' }],
  },
  {
    label: 'Geist',
    value: 'Geist, system-ui, sans-serif',
    faces: [{ id: 'geist-latin', family: 'Geist', weight: '300 800' }],
  },
  {
    label: 'Space Grotesk',
    value: 'Space Grotesk, system-ui, sans-serif',
    faces: [{ id: 'space-grotesk-latin', family: 'Space Grotesk', weight: '300 700' }],
  },
  {
    label: 'IBM Plex Sans',
    value: 'IBM Plex Sans, system-ui, sans-serif',
    faces: [{ id: 'ibm-plex-sans-latin', family: 'IBM Plex Sans', weight: '300 700' }],
  },
  { label: 'System Mono', value: 'ui-monospace, monospace' },
  {
    label: 'JetBrains Mono',
    value: 'JetBrains Mono, ui-monospace, monospace',
    faces: [{ id: 'jetbrains-mono-latin', family: 'JetBrains Mono', weight: '300 700' }],
  },
  {
    label: 'IBM Plex Mono',
    value: 'IBM Plex Mono, ui-monospace, monospace',
    faces: [300, 400, 500, 600, 700].map((weight) => ({
      id: `ibm-plex-mono-latin-${weight}`,
      family: 'IBM Plex Mono',
      weight: String(weight),
    })),
  },
] as const;

export type DesignFontValue = (typeof DESIGN_FONT_OPTIONS)[number]['value'];

export function designFontFaces(fontStack: string): readonly DesignFontFace[] {
  const option = DESIGN_FONT_OPTIONS.find((entry) => entry.value === fontStack);
  return option && 'faces' in option ? option.faces : [];
}
