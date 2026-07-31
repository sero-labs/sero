/**
 * The engine's vocabulary (D15).
 *
 * Everything here is plain data. The engine has no file system, no network, no
 * clock and no provider knowledge: grids and an animation description go in, a
 * pixel buffer and an atlas come out. A future game engine can take this folder
 * as it stands.
 */

/** A drawn picture as it arrives from a video or image model: 8-bit RGBA. */
export interface SourceImage {
  width: number;
  height: number;
  /** `width * height * 4` bytes, straight alpha. */
  data: Uint8Array;
}

/** One sampled moment of a clip, carrying the real time it held (D23). */
export interface SourcePlate {
  image: SourceImage;
  durationMs: number;
}

export type Rgb = readonly [number, number, number];

/**
 * A character's locked colour set.
 *
 * Cells address it by index. Transparency is **not** an entry: a transparent
 * cell is `TRANSPARENT`, so a palette of 66 colours has 66 entries and no
 * reserved slot. The storage layer is where index 0 becomes transparent, which
 * keeps that file convention out of the engine.
 */
export type Palette = readonly Rgb[];

/** A cell nothing was drawn in. */
export const TRANSPARENT = -1;

/**
 * The stored form: one palette index per cell, `TRANSPARENT` where nothing is
 * drawn. `Int16Array` because a palette may run to 256 entries and the sentinel
 * is negative.
 */
export interface CellGrid {
  cols: number;
  rows: number;
  cells: Int16Array;
}

/**
 * The mean foreground colour and coverage of each art cell, before any palette
 * decision. Alignment is measured from this rather than from quantised cells
 * (D26), so it has to survive as its own stage rather than being folded into
 * quantising.
 */
export interface RawGrid {
  cols: number;
  rows: number;
  /** `cols * rows * 3` — mean red, green and blue of the foreground pixels. */
  colour: Float64Array;
  /** `cols * rows` — the share of the cell that was foreground, 0 to 1. */
  coverage: Float64Array;
}

/** Foreground mask over a source image: 1 where the character is. */
export type Foreground = Uint8Array;

/** Where the character sits in one source plate, in source pixels. */
export interface Silhouette {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** Foreground pixel count. */
  count: number;
  /**
   * The drawing runs off the edge of the picture it was drawn in — the one
   * fault nothing downstream can repair (D19).
   */
  clipped: boolean;
  /** The row below the lowest *solid* row of the body, never a blade tip (D35). */
  footY: number;
  /** Horizontal centre of the lowest band of the body. */
  footX: number;
  /** Foreground the connected-body filter dropped, as a share of the whole (D35). */
  detached: number;
}

export interface Offset {
  dx: number;
  dy: number;
}

/** How a finished animation plays. Aseprite carries all three unchanged (D34). */
export type LoopMode = 'once' | 'forward' | 'pingpong';

/** A ramp: palette entries that share a hue and differ in lightness (D27). */
export interface Ramp {
  id: number;
  neutral: boolean;
  indexes: number[];
  /** 0 at the darkest member, 1 at the lightest. */
  positionOf: Map<number, number>;
  steps: number;
}

export interface RampUsage {
  id: number;
  count: number;
  /** Mean position along the ramp, or null when the frame does not use it. */
  centre: number | null;
  steps: number;
}
