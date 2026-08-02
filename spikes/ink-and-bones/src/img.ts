/**
 * A float RGBA pixel buffer, 0..1 per channel — the Image stand-in for the
 * whole pipeline. Floats, not bytes, because parts are composited with alpha
 * and bilinear sampling before the grade quantizes everything back to exact
 * palette bytes at the very end.
 */

export type Color = readonly [number, number, number, number];

export const TRANSPARENT: Color = [0, 0, 0, 0];

/** Palette entries are authored as hex, exactly like art/palette.gd. */
export function hex(rgb: string, alpha = 1): Color {
  const n = parseInt(rgb, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** The tolerance Godot's is_equal_approx uses for the emissive checks. */
export function sameColor(a: Color, b: Color): boolean {
  return (
    Math.abs(a[0] - b[0]) < 1e-4 &&
    Math.abs(a[1] - b[1]) < 1e-4 &&
    Math.abs(a[2] - b[2]) < 1e-4
  );
}

export function darkened(c: Color, amount: number): Color {
  return [c[0] * (1 - amount), c[1] * (1 - amount), c[2] * (1 - amount), c[3]];
}

export function shade(c: Color, amount: number): Color {
  // Positive lightens toward white, negative darkens — Godot's shade() helper.
  if (amount >= 0) {
    return [
      c[0] + (1 - c[0]) * amount,
      c[1] + (1 - c[1]) * amount,
      c[2] + (1 - c[2]) * amount,
      c[3],
    ];
  }
  return darkened(c, -amount);
}

export class Img {
  readonly w: number;
  readonly h: number;
  readonly data: Float32Array;

  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.ceil(w));
    this.h = Math.max(1, Math.ceil(h));
    this.data = new Float32Array(this.w * this.h * 4);
  }

  get(x: number, y: number): Color {
    const i = (y * this.w + x) * 4;
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  alpha(x: number, y: number): number {
    return this.data[(y * this.w + x) * 4 + 3];
  }

  set(x: number, y: number, c: Color): void {
    const i = (y * this.w + x) * 4;
    const d = this.data;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = c[3];
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Source-over blend of `c` onto the pixel. */
  blend(x: number, y: number, c: Color): void {
    const i = (y * this.w + x) * 4;
    const d = this.data;
    const a = c[3];
    const ia = 1 - a;
    d[i] = c[0] * a + d[i] * ia;
    d[i + 1] = c[1] * a + d[i + 1] * ia;
    d[i + 2] = c[2] * a + d[i + 2] * ia;
    d[i + 3] = a + d[i + 3] * ia;
  }

  /** Blend a whole image over this one at (0,0) — Image.blend_rect. */
  blendImage(src: Img): void {
    const w = Math.min(this.w, src.w);
    const h = Math.min(this.h, src.h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = src.get(x, y);
        if (c[3] > 0.001) this.blend(x, y, c);
      }
    }
  }

  flippedX(): Img {
    const out = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    }
    return out;
  }
}
