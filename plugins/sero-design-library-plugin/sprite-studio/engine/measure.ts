/**
 * Where the character is in one drawn plate, in source pixels.
 *
 * Two of the five faults the investigation found were measurement faults rather
 * than pipeline faults, and both are answered here: the foot line takes the
 * lowest *solid* row rather than the lowest pixel (D35), and a drawing that runs
 * off the edge of its own picture is reported rather than quietly accepted
 * (D19).
 */

import type { Foreground, Silhouette, SourceImage } from './types';

/** A row must carry about a tenth of the body's width to count as standing. */
const SOLID_SHARE = 0.12;
/** The band above the foot line whose horizontal centre becomes `footX`. */
const FOOT_BAND_SHARE = 0.06;

export function measureSilhouette(
  image: SourceImage,
  foreground: Foreground,
  detached = 0,
): Silhouette | null {
  const { width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (foreground[y * width + x]) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxY < 0) return null;

  // The one fault nothing downstream can repair: the drawing itself is cut off
  // at the edge of the picture it was drawn in. A canvas is derived from the
  // frames, so it can never be too small — but a whip that ran past the edge of
  // the video frame is already missing, and no canvas puts it back.
  const clipped = minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;

  // The feet are the lowest *solid* part of the character, not the lowest pixel.
  //
  // The knight holds a sword that hangs below his tucked feet in the air. Taking
  // the lowest pixel makes the sword tip the foot line, so a jump of 75 pixels
  // measured as 8. A row has to carry real width to count as standing on
  // something; a blade tip never does.
  const bodyWidth = maxX - minX + 1;
  const solid = Math.max(3, Math.round(bodyWidth * SOLID_SHARE));
  let footRow = maxY;
  for (let y = maxY; y >= minY; y--) {
    let filled = 0;
    for (let x = minX; x <= maxX; x++) if (foreground[y * width + x]) filled++;
    if (filled >= solid) {
      footRow = y;
      break;
    }
  }

  const bandTop = Math.max(minY, footRow - Math.round((footRow - minY + 1) * FOOT_BAND_SHARE));
  let sum = 0;
  let n = 0;
  for (let y = bandTop; y <= footRow; y++)
    for (let x = minX; x <= maxX; x++)
      if (foreground[y * width + x]) {
        sum += x;
        n++;
      }

  return {
    minX,
    minY,
    maxX,
    maxY,
    count,
    clipped,
    detached,
    width: bodyWidth,
    height: maxY - minY + 1,
    footY: footRow + 1,
    footX: n > 0 ? sum / n : (minX + maxX) / 2,
  };
}
