/**
 * The extractable engine (D15).
 *
 * Grids and an animation description go in; a pixel buffer and an atlas come
 * out. No file system, no network, no clock and no provider knowledge — PNG
 * encoding stays outside, in the runtime, where `node:zlib` is available, so an
 * engine taken into a game does not have to carry a compressor.
 */

export { alignRaw, frameDifference, rawDifference } from './align';
export { detectArtGrid, recoverArtwork, type ArtGrid, type RecoveredArtwork } from './art-grid';
export { ATLAS_APP, buildAtlas, type Atlas, type AtlasFrame, type AtlasTag } from './atlas';
export {
  DEFAULT_LIMITS,
  checkAnimation,
  checkContinuity,
  countOrphans,
  framesToRepair,
  refusals,
  type CheckLimits,
  type Finding,
} from './checks';
export {
  buildRamps,
  fromHex,
  labDistance,
  nearestEntry,
  oklab,
  rampDrift,
  rampIndex,
  rampUsage,
  toHex,
  type Lab,
} from './colour';
export {
  compileAnimation,
  requantise,
  type CompileOptions,
  type CompiledAnimation,
  type CompiledFrame,
} from './compile';
export { MAGENTA, floodForeground, keepLargestBody, keyForeground } from './key';
export {
  LOOP_CLEAN,
  LOOP_HOPELESS,
  loopAdvice,
  loopClosure,
  playOrder,
  searchLoop,
  type LoopCandidate,
  type LoopSearch,
} from './loop';
export { measureSilhouette } from './measure';
export {
  capPalette,
  capResidual,
  dedupePalette,
  paletteWeights,
  remapCells,
} from './palette';
export {
  DEFAULT_QUANTISE,
  quantiseSequence,
  staticChurn,
  type QuantiseOptions,
  type QuantisedSequence,
} from './quantise';
export { rawGrid } from './resample';
export { detectGrounded, rootCorrections, type RootCorrection } from './root';
export {
  buildSheet,
  resolveScale,
  type PlacedAnimation,
  type PlacedFrame,
  type Sheet,
  type SheetAnimation,
  type SheetLayout,
  type SheetOptions,
} from './sheet';
export { extremesOf, reachOf, thin, type ThinOptions, type ThinnedFrame } from './thin';
export {
  TRANSPARENT,
  type CellGrid,
  type Foreground,
  type LoopMode,
  type Offset,
  type Palette,
  type Ramp,
  type RampUsage,
  type RawGrid,
  type Rgb,
  type Silhouette,
  type SourceImage,
  type SourcePlate,
} from './types';
