/**
 * The character, and everything that belongs to one (spec §3).
 *
 * A character owns its palette, its size and its anchor, and every animation
 * belongs to it. That ownership is what lets someone come back next week, ask
 * for a jump, and get a sprite that matches.
 *
 * Records are the authority; reactive state carries summaries projected from
 * them. Nothing here holds pixels: frames are indexed PNGs on disk, named by
 * these records.
 */

import type { LoopMode } from '../engine/types';

export type { LoopMode };

/** Where the character came from, for the card and for provenance. */
export type CharacterSource = 'reference' | 'library-item' | 'text';

export type CharacterStatus = 'draft' | 'approved';

/** A palette cap the user chose at the character sheet (D17). */
export interface PaletteCap {
  kind: 'measured' | 'count' | 'fixed';
  /** Set for `count`: 32, 16, 8 or anything else they typed. */
  count?: number;
  /** Set for `fixed`: the palette they supplied, as hexes. */
  palette?: string[];
  /** A name for a supplied set, so the chip can say "NES" rather than "fixed". */
  label?: string;
}

/**
 * What ingestion measured, kept so the character sheet can show its working and
 * a re-measure can be compared against it.
 */
export interface IngestionReport {
  /** File pixels per art pixel, and how much better than chance that lines up. */
  block: number;
  lift: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Colours before any cap was applied. */
  measuredColours: number;
  /** How far the sprite sits from its own palette after the cap, ×1000. */
  residual: number;
  backgroundRemoved: boolean;
}

export interface CharacterRoot {
  /** The foot line, in art pixels from the top of the base pose. */
  footRow: number;
  /** The horizontal centre of the lowest band of the body. */
  centreCol: number;
}

export interface CharacterRecord {
  id: string;
  name: string;
  source: CharacterSource;
  /** The file the character was made from, relative to the app state directory. */
  sourceFile?: string;
  status: CharacterStatus;
  /** The locked colour set, as hexes. Entry order is the palette's identity. */
  palette: string[];
  cap: PaletteCap;
  /**
   * The palette grouped into named material ramps, set at approval and used to
   * tell a lighting shift from a wrong colour (D27). The names are the AI's; the
   * grouping is measured.
   */
  ramps: { name: string; indexes: number[] }[];
  /** The character's height in art pixels. The reference: 136. */
  artHeight: number;
  artWidth: number;
  /** Whole numbers only, or the pixels blur (D3). */
  exportScale: number;
  /** The base pose, relative to the app state directory. An indexed PNG. */
  basePoseFile: string;
  root: CharacterRoot;
  /** What the AI must preserve, in words. Shown on the character sheet. */
  styleNotes: string;
  ingestion: IngestionReport;
  /** The video model this character was last generated with (D29). */
  lastVideoModel?: string;
  /** Pinned to the top of the shelf. On the record, so a projection keeps it. */
  favourite?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** One drawn frame of one animation. */
export interface FrameRecord {
  id: string;
  /** The indexed PNG, relative to the app state directory. */
  file: string;
  /** This frame's root within the animation's canvas, in art pixels. */
  root: { x: number; y: number };
  /** Whether the feet are on the ground here (D21, declared then checked). */
  grounded: boolean;
  /** The real time this frame held in the source (D23). */
  durationMs: number;
  /** A label for the strip: "the crack", "the wind-up". */
  label?: string;
  provenance: FrameProvenance;
  /** What the checks said about this frame, kept so the panel can show it. */
  findings: StoredFinding[];
}

export interface FrameProvenance {
  /** The model that drew it: a video endpoint, or the repair model. */
  model: string;
  kind: 'video' | 'pose' | 'hand-edited';
  /** How many times this frame has been redrawn. */
  repairs: number;
  /** Which sampled frame of the clip it came from, when it came from one. */
  sampledIndex?: number;
  createdAt: number;
}

export interface StoredFinding {
  check: string;
  level: 'refuse' | 'warn';
  message: string;
}

export type AnimationStatus =
  | 'planned'
  | 'generating'
  | 'awaiting-frames'
  /** Short and unattended: working out which frames to offer, and drawing them. */
  | 'proposing'
  /** Resting. Nothing is running, and it survives a restart (spec §2.4). */
  | 'awaiting-review'
  | 'compiling'
  | 'judging'
  | 'ready'
  | 'approved'
  | 'failed';

/**
 * What the selector would keep, offered to the user before anything is built.
 *
 * The frames here are a proposal and not a decision: the review screen is where
 * it is overruled, and the rule that produced it only has to start somewhere
 * sensible. Held on the record rather than in reactive state because the samples
 * it names are on disk, and a review has to survive closing the app.
 */
export interface ReviewProposal {
  /** The staged samples the build will read. Held until the review is settled. */
  stagingKey: string;
  sampleCount: number;
  /** The real time each sampled frame held, so the build keeps the timing (D23). */
  sampleDurationsMs: number[];
  /** The sample indices the selector chose. */
  proposed: number[];
  /** The cycle the loop search found, drawn as a band on the strip. */
  loopWindow?: { from: number; to: number };
  /** Source pixels per art pixel, calibrated once for the whole clip (D12). */
  scale: number;
  proposedAt: number;
}

/** What the AI planned, before anything was drawn (spec §4). */
export interface AnimationPlan {
  name: string;
  /** The motion instruction sent to the video model. */
  instruction: string;
  /** How many frames the action needs. Not the play rate. */
  frameCount: number;
  playRate: number;
  loop: LoopMode;
  /**
   * Which frames the feet are off the ground for, as a range over the planned
   * frames. Checked against the pixels, never trusted (D21).
   */
  airborne?: { from: number; to: number };
  /** Where the extremes of the action fall, as the AI expects them. */
  extremes?: number[];
}

export interface AnimationRecord {
  id: string;
  characterId: string;
  plan: AnimationPlan;
  status: AnimationStatus;
  /** Sized to this animation's widest pose, in art pixels (D13). */
  canvas: { cols: number; rows: number };
  /** The character's root within this canvas. */
  anchor: { col: number; row: number };
  frames: FrameRecord[];
  /** Sequence-level findings — churn, loop closure, ground contact. */
  findings: StoredFinding[];
  report: AnimationReport | null;
  /** The clip this was made from, relative to the app state directory. */
  clipFile?: string;
  videoModel?: string;
  /** Set while the frames are waiting to be picked. Cleared when it is settled. */
  review?: ReviewProposal;
  /**
   * Which `sprite.generate` created this one.
   *
   * So a batch can be recognised without parsing an id: the review opens once,
   * at the end, when no animation of the same batch is still working.
   */
  batchId?: string;
  /** Set when the run failed, in words the user can act on. */
  error?: string;
  /** Every earlier version, newest last. A repair appends rather than replaces. */
  history: AnimationRevision[];
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  deletedAt?: number;
}

/** A superseded version of an animation, kept because repairs append (D18). */
export interface AnimationRevision {
  id: string;
  reason: string;
  frames: FrameRecord[];
  report: AnimationReport | null;
  createdAt: number;
}

/**
 * The measurements the checkpoint is judged on (spec §5, prototype state 5).
 *
 * Written as numbers rather than as verdicts, so approving is a judgement about
 * the art and not about the machinery.
 */
export interface AnimationReport {
  sampledFrames: number;
  keptFrames: number;
  /** Worst frame's share of cells drawn off the palette. */
  offPalette: number;
  /** Cells that change where nothing is happening, with memory on and off. */
  churn: number;
  churnWithoutMemory: number;
  /** How far the character drifted after anchoring, in art pixels. */
  drift: number;
  /** How far the last frame is from the first, for a forward loop. */
  loopClosure: number | null;
  /** The best loop the clip could make, whether or not it was used. */
  loopCandidate: { start: number; end: number; cost: number } | null;
  /** Frames on the ground, out of the frames kept. */
  grounded: number;
  /** How far the feet travelled, in art pixels. Zero for a standing animation. */
  footTravel: number;
  /** Worst frame's body height against the character's, in art pixels. */
  heightSpread: number;
  /** How many frames were redrawn, and which. */
  repairedFrames: number[];
  /** True when nothing touched the ground, so no drift correction was applied. */
  uncorrected: boolean;
}

export function characterIsApproved(character: CharacterRecord): boolean {
  return character.status === 'approved';
}

/**
 * No sprite is this big. Above it, "artwork already at its true size" is not a
 * credible reading of a picture with no grid in it.
 */
const LARGEST_SPRITE = 512;

/**
 * Why this character cannot be used, in words the user can act on.
 *
 * Checked before approval, because everything downstream inherits from here: a
 * character measured wrong produces a wrong sprite from every animation ever
 * made from it, and each one of those costs a paid clip. This is the cheapest
 * possible place to say no.
 */
export function characterProblem(character: CharacterRecord): string | null {
  if (character.palette.length === 0) return 'This character has no palette.';
  if (character.artHeight <= 0) return 'This character has no measured height.';
  if (!Number.isInteger(character.exportScale) || character.exportScale < 1) {
    return 'The export scale must be a whole number, or the pixels blur.';
  }
  // A picture with no grid **and** no plausible sprite size in it. Pixel art
  // drawn at its true size is small and lands here legitimately; a 1084 pixel
  // character does not. The usual cause is a JPEG or a resized copy, both of
  // which destroy the grid before Sprite Studio ever sees the file — and
  // nothing downstream can put it back.
  if (character.ingestion.block === 1 && character.artHeight > LARGEST_SPRITE) {
    return (
      `No pixel grid was found in this picture, and the artwork measures ` +
      `${character.artWidth} × ${character.artHeight}, which is far too big for a sprite. ` +
      'That happens when the file is a JPEG or has been resized — both smear the hard ' +
      'edges the grid is measured from, and neither can be undone. Use the original PNG.'
    );
  }
  return null;
}
