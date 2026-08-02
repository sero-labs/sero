import type { Color } from '../src/index';
import { Img } from '../src/index';

export const SUIT: Color = [78 / 255, 95 / 255, 120 / 255, 1];
export const SUIT_LIGHT: Color = [123 / 255, 144 / 255, 168 / 255, 1];
export const SUIT_DARK: Color = [49 / 255, 61 / 255, 82 / 255, 1];
export const SASH: Color = [242 / 255, 154 / 255, 58 / 255, 1];
export const INK: Color = [21 / 255, 18 / 255, 33 / 255, 1];

export function fillRect(img: Img, x0: number, y0: number, w: number, h: number, c: Color): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) img.set(x, y, c);
  }
}

export function mix(a: Color, b: Color, t: number): Color {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}
