/**
 * Capturing stills from a generated video, in the renderer (D4).
 *
 * The runtime has no codecs and no image library, and putting either into the
 * background process for the sake of a thumbnail is the wrong trade — the
 * browser already decodes every format it will ever be handed. So a clip
 * finishes with nothing to paint and nothing the Librarian can look at, and the
 * open app does the work when it next sees one.
 *
 * Two images come out. The **poster** is the thumbnail. The **filmstrip** is
 * several moments side by side in one image, which is what the Librarian is
 * shown: it cannot watch a video, and one strip conveys the progression at the
 * cost of a single attachment rather than four.
 */

/** Enough moments to read a movement; more would shrink each past legibility. */
export const FILMSTRIP_FRAMES = 4;
/** Each frame in the strip, and the poster's long edge. */
const FRAME_WIDTH = 480;
/** Nothing here needs to be lossless; these are things to look at, not sources. */
const QUALITY = 0.82;

export interface CapturedFrames {
  poster: Blob;
  filmstrip: Blob;
  width: number;
  height: number;
  durationMs: number;
}

/**
 * Where to sample.
 *
 * Not from zero: the first frame of a generated clip is very often a black or
 * near-empty lead-in, and a poster of a black rectangle is worse than no poster.
 * Not to the very end either, since some encoders leave the last frame
 * undecodable.
 */
export function sampleTimes(durationSeconds: number, count = FILMSTRIP_FRAMES): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return Array.from({ length: count }, () => 0);
  }
  const first = durationSeconds * 0.1;
  const last = durationSeconds * 0.9;
  if (count === 1) return [first];
  const step = (last - first) / (count - 1);
  return Array.from({ length: count }, (_, index) => first + step * index);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('The canvas produced no image.')) : resolve(blob)),
      'image/webp',
      QUALITY,
    );
  });
}

/** Resolve once the video is at `time` and has a frame there to draw. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be decoded.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

function loadMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be read.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });
}

/**
 * Decode a clip and return its poster and filmstrip.
 *
 * The element is never attached to the document: it exists to be decoded from,
 * and mounting it would put a video the user did not ask for on screen. It is
 * muted and `preload="auto"` for the same reason — this must not make a sound.
 */
export async function captureFrames(source: Blob): Promise<CapturedFrames> {
  // Revoked in the `finally` below, on every path including a failed decode.
  // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke
  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  // Some browsers refuse to decode a cross-origin video into a canvas; a blob
  // URL is same-origin, and this makes that explicit rather than incidental.
  video.crossOrigin = 'anonymous';

  try {
    const metadata = loadMetadata(video);
    video.src = url;
    await metadata;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) throw new Error('The video reported no dimensions.');

    const scale = FRAME_WIDTH / width;
    const frameWidth = Math.max(1, Math.round(width * scale));
    const frameHeight = Math.max(1, Math.round(height * scale));

    const strip = document.createElement('canvas');
    strip.width = frameWidth * FILMSTRIP_FRAMES;
    strip.height = frameHeight;
    const stripContext = strip.getContext('2d');

    const poster = document.createElement('canvas');
    poster.width = frameWidth;
    poster.height = frameHeight;
    const posterContext = poster.getContext('2d');

    if (!stripContext || !posterContext) throw new Error('This renderer has no 2D canvas.');

    const times = sampleTimes(video.duration);
    for (const [index, time] of times.entries()) {
      // Sequential on purpose: one element, one playhead. Seeking again before
      // the previous frame is drawn would paint the same moment several times.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await seek(video, time);
      stripContext.drawImage(video, index * frameWidth, 0, frameWidth, frameHeight);
      // The poster is the first sampled moment, which is already past the
      // lead-in rather than being the literal first frame.
      if (index === 0) posterContext.drawImage(video, 0, 0, frameWidth, frameHeight);
    }

    const [posterBlob, filmstripBlob] = await Promise.all([toBlob(poster), toBlob(strip)]);
    return {
      poster: posterBlob,
      filmstrip: filmstripBlob,
      width,
      height,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
    };
  } finally {
    // Both, and in this order: dropping the src first stops any decode still in
    // flight from holding the object URL open after it is revoked.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
