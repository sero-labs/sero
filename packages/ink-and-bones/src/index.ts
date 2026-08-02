/**
 * @sero-ai/ink-and-bones — procedural puppet animation.
 *
 * A character is a program: a skeleton, parts painted once in bone-local
 * space, and clips as eased curves. The compositor evaluates and grades it
 * onto a pixel grid, deterministically. The audit gates measure what a still
 * frame will not show. Nothing in here touches Node, Electron, or the DOM —
 * the same code runs in a browser, a worker, and a background runtime.
 */

/** Mirrors package.json's version; part of consumers' bake cache keys, so a
 * new engine misses stale caches. Bump together with the version field. */
export const ENGINE_VERSION = '0.1.0';

// the LLM's (or a person's) system material for writing a character
export { AUTHORING_GUIDE } from './authoring-guide';

// math + pixels
export type { Vec, Affine } from './vec';
export {
  add,
  apply,
  basisXform,
  clamp,
  degToRad,
  dist,
  fposmod,
  fromRot,
  identity,
  inverse,
  lerp,
  mul,
  normalize,
  radToDeg,
  smoothstep,
  sub,
  unit,
} from './vec';
export type { Color } from './img';
export { Img, MAX_IMG_PIXELS, TRANSPARENT, darkened, hex, limitImgAllocations, sameColor, shade } from './img';

// authoring surface
export type { Rect } from './paint';
export { Paint } from './paint';
export type { ChainDef, Pose } from './skeleton';
export { Skeleton, worldDirToLocal } from './skeleton';
export type { Ease } from './motion';
export { Motion } from './motion';

// bake
export type { ChainPart, GradeConfig, Part, RigidPart, Shadow } from './compositor';
export { SS, bake, despeckle, renderPose, renderRest } from './compositor';
export { assertClipTiming, settleChains, simulateChains } from './chains';

// the character contract
export type { BakedClip, CharacterSpec } from './spec';
export { bakeAllClips, bakeClip, bakeRest, colorKey, vocabulary } from './spec';

// playback
export { ClipPlayer } from './player';

// measurement + gates
export type { FrameStats } from './metrics';
export {
  changed,
  cxWobble,
  edgeFill,
  islands,
  offVocabPx,
  pocketPx,
  specklePx,
  stats,
} from './metrics';
export type { AuditCheck, AuditCheckId, AuditReport } from './audit';
export { auditCharacter, auditClip, formatReport } from './audit';

// review images
export { frameStrip, frameStripScaled, poseGrid, scaleNearest, sideBySide, zoom } from './review';
