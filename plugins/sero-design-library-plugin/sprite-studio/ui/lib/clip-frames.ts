/**
 * Pulling the frames out of a clip, in the renderer.
 *
 * **The runtime has no codecs.** A finished clip arrives with nothing to
 * compile from, so the open page decodes it, samples it and hands the frames
 * back — the same arrangement the Library already uses for video thumbnails.
 * There is no second path: if this does not run, the animation never gets past
 * `awaiting-frames`.
 *
 * Which is why it is written to be dull. Seeks are sequential because there is
 * one playhead; the object URL is revoked on every exit including a failed
 * decode; and the caller keys each clip so one is never decoded twice.
 *
 * Frames are encoded as PNG. They are the source the quantiser works from, and
 * a lossy codec would invent colours it then has to undo.
 */

import type { AppTools } from '@sero-ai/app-runtime';

import { frameName, newSpriteId, readAsset, sendRequest, stageFile } from './requests';

export interface ClipFramesTarget {
  animationId: string;
  clipPath: string;
  sampleFps: number;
  expectedFrames: number;
}

/**
 * One clip, identified by what would make it need decoding again.
 *
 * The path is part of it as well as the animation: a redo writes a new clip
 * under the same animation, and a key without it would look already-attempted.
 */
export function clipKey(target: Pick<ClipFramesTarget, 'animationId' | 'clipPath'>): string {
  return `${target.animationId}:${target.clipPath}`;
}

/**
 * Where to sample, in seconds.
 *
 * From the very start, unlike a poster: the first frame is the plate the model
 * was given and it belongs in the sequence. The final sample is pulled back
 * inside the clip because the last moment is often undecodable, and the count
 * never runs past what the clip holds — asking for more would seek to the same
 * moment repeatedly and stage the same drawing several times.
 */
export function sampleTimes(
  durationSeconds: number,
  sampleFps: number,
  expectedFrames?: number,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isFinite(sampleFps) || sampleFps <= 0) return [];

  const step = 1 / sampleFps;
  const last = Math.max(0, durationSeconds - step / 4);
  const wanted =
    expectedFrames !== undefined && Number.isInteger(expectedFrames) && expectedFrames > 0
      ? expectedFrames
      : Math.floor(durationSeconds * sampleFps) + 1;
  const room = Math.floor(last / step) + 1;
  const count = Math.min(wanted, room);
  return Array.from({ length: count }, (_, index) => Math.min(index * step, last));
}

/**
 * How long each sampled frame held, in milliseconds.
 *
 * Measured from the sample times themselves rather than assumed from the rate,
 * so the last frame gets the remainder of the clip instead of a nominal tick —
 * this is the timing that survives into the finished animation (D23).
 */
export function frameDurations(times: readonly number[], durationSeconds: number): number[] {
  return times.map((time, index) => {
    const next = index + 1 < times.length ? (times[index + 1] ?? durationSeconds) : durationSeconds;
    return Math.max(1, Math.round((next - time) * 1000));
  });
}

function loadMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('The clip could not be read.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('error', failed);
    };
    video.addEventListener('loadedmetadata', done);
    video.addEventListener('error', failed);
  });
}

/** Resolve once the video is at `time` and has a frame there to draw. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('The clip could not be decoded.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', failed);
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', failed);
    video.currentTime = time;
  });
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('The canvas produced no image.')) : resolve(blob)),
      'image/png',
    );
  });
}

export interface DecodedClip {
  frames: Blob[];
  durationsMs: number[];
}

/**
 * Decode a clip into one PNG per sampled moment.
 *
 * The element is never attached to the document: it exists to be decoded from,
 * and mounting it would put a video the user did not ask for on screen. Muted,
 * because this must not make a sound.
 */
export async function decodeClipFrames(
  clip: Blob,
  sampleFps: number,
  expectedFrames: number,
): Promise<DecodedClip> {
  // Revoked in the `finally` below, on every path including a failed decode.
  // react-doctor-disable-next-line react-doctor/no-create-object-url-without-revoke
  const url = URL.createObjectURL(clip);
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
    if (width === 0 || height === 0) throw new Error('The clip reported no dimensions.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This renderer has no 2D canvas.');

    const times = sampleTimes(video.duration, sampleFps, expectedFrames);
    const frames: Blob[] = [];
    for (const time of times) {
      // Sequential on purpose: one element, one playhead. Seeking again before
      // the previous frame is drawn would capture the same moment twice.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await seek(video, time);
      context.clearRect(0, 0, width, height);
      context.drawImage(video, 0, 0, width, height);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      frames.push(await toPng(canvas));
    }

    return { frames, durationsMs: frameDurations(times, video.duration) };
  } finally {
    // Both, and in this order: dropping the src first stops any decode still in
    // flight from holding the object URL open after it is revoked.
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export interface ClipFramesResult {
  ok: boolean;
  error?: string;
}

async function stageFrame(
  tools: AppTools,
  stagingKey: string,
  index: number,
  frame: Blob,
): Promise<void> {
  await stageFile(tools, stagingKey, frameName(index), new Uint8Array(await frame.arrayBuffer()));
}

/**
 * Read a clip back, decode it, stage the frames and attach them.
 *
 * A fresh staging key each time, never one derived from the animation: a second
 * attempt that produced fewer frames would otherwise leave the first attempt's
 * surplus sitting under the same names, and the runtime reads whatever is
 * there.
 */
export async function attachClipFrames(
  tools: AppTools,
  target: ClipFramesTarget,
): Promise<ClipFramesResult> {
  const clip = await readAsset(tools, target.clipPath);
  if (clip === null) return { ok: false, error: 'The stored clip could not be read.' };

  const decoded = await decodeClipFrames(clip, target.sampleFps, target.expectedFrames).catch(
    (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
  );
  if (decoded instanceof Error) return { ok: false, error: decoded.message };
  if (decoded.frames.length === 0) return { ok: false, error: 'The clip held no frames.' };

  const stagingKey = newSpriteId('frames');
  for (const [index, frame] of decoded.frames.entries()) {
    // One frame at a time. Sixty of them are already held as blobs; turning them
    // all into base64 at once would be the same bytes over again in a string.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await stageFrame(tools, stagingKey, index, frame);
  }

  await sendRequest(tools, {
    kind: 'sprite.frames.attach',
    animationId: target.animationId,
    stagingKey,
    durationsMs: decoded.durationsMs,
  });
  return { ok: true };
}
