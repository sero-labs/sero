/** Stable colour families used by the Library filter. */

export const COLOUR_FAMILIES = [
  'Reds',
  'Oranges',
  'Yellows',
  'Greens',
  'Cyans',
  'Blues',
  'Purples',
  'Pinks',
  'Neutrals',
  'Other colours',
] as const;

export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

const HUE_FAMILIES: { upperBound: number; family: ColourFamily }[] = [
  { upperBound: 15, family: 'Reds' },
  { upperBound: 45, family: 'Oranges' },
  { upperBound: 70, family: 'Yellows' },
  { upperBound: 165, family: 'Greens' },
  { upperBound: 200, family: 'Cyans' },
  { upperBound: 260, family: 'Blues' },
  { upperBound: 320, family: 'Purples' },
  { upperBound: 345, family: 'Pinks' },
];

export function isColourFamily(value: unknown): value is ColourFamily {
  return typeof value === 'string' && (COLOUR_FAMILIES as readonly string[]).includes(value);
}

function rgbFromHex(value: string): Rgb | null {
  const match = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (!match) return null;

  const compact = match[1];
  let hex = compact.slice(0, 6);
  if (compact.length === 3) {
    hex = compact.split('').map((digit) => `${digit}${digit}`).join('');
  }
  return {
    red: Number.parseInt(hex.slice(0, 2), 16) / 255,
    green: Number.parseInt(hex.slice(2, 4), 16) / 255,
    blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function hueFor({ red, green, blue }: Rgb, maximum: number, difference: number): number {
  let hueBase: number;
  if (maximum === red) hueBase = (green - blue) / difference;
  else if (maximum === green) hueBase = (blue - red) / difference + 2;
  else hueBase = (red - green) / difference + 4;
  return (hueBase * 60 + 360) % 360;
}

export function colourFamily(value: string): ColourFamily {
  const rgb = rgbFromHex(value);
  if (!rgb) return 'Other colours';

  const { red, green, blue } = rgb;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = difference / Math.max(1 - Math.abs(2 * lightness - 1), Number.EPSILON);

  if (lightness < 0.08 || lightness > 0.92 || saturation < 0.16) return 'Neutrals';

  const hue = hueFor(rgb, maximum, difference);
  return HUE_FAMILIES.find((entry) => hue < entry.upperBound)?.family ?? 'Reds';
}

export function availableColourFamilies(colours: string[]): ColourFamily[] {
  const available = new Set<ColourFamily>();
  for (const colour of colours) available.add(colourFamily(colour));
  return COLOUR_FAMILIES.filter((family) => available.has(family));
}
