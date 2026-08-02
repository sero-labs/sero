/**
 * Sprite Studio's slice of reactive state, and the intent that changes it.
 *
 * The page rides the Design Library's single-writer machinery rather than
 * building a second one: the UI appends a request, the background runtime is the
 * only writer, and requests are consumed behind a monotonic watermark. What
 * Sprite Studio adds is this slice and these request kinds — the whole of its
 * contact with the rest of the plugin, besides the fal connection and the
 * settings (D6).
 *
 * Summaries only. Palettes are here because a card draws one; pixels never are.
 */

import type {
  AnimationReport,
  AnimationStatus,
  CharacterSource,
  CharacterStatus,
  LoopMode,
  PaletteCap,
} from './character';
// The repair endpoint has one definition, beside the measurement that chose it.
import { REPAIR_MODEL } from './video-models';

export interface CharacterSummary {
  id: string;
  name: string;
  status: CharacterStatus;
  source: CharacterSource;
  /** The base pose, relative to the app state directory, for the card. */
  previewPath: string;
  artWidth: number;
  artHeight: number;
  /** The whole palette: a card shows the first few, the sheet shows them all. */
  palette: string[];
  animationCount: number;
  /** Animations still waiting for the user at a checkpoint. */
  awaitingApproval: number;
  favourite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AnimationSummary {
  id: string;
  characterId: string;
  name: string;
  status: AnimationStatus;
  loop: LoopMode;
  playRate: number;
  frameCount: number;
  canvas: { cols: number; rows: number };
  /** A short line for the rail: what is happening, or what went wrong. */
  progress?: string;
  error?: string;
  /** True when the sequence has findings the user should look at. */
  hasWarnings: boolean;
  report: AnimationReport | null;
  updatedAt: number;
  approvedAt?: number;
  /**
   * A finished clip whose frames the renderer has not pulled out yet.
   *
   * The runtime has no codecs, so a clip arrives with nothing to compile from.
   * The open page decodes it, uploads the frames, and this clears — the same
   * arrangement the Library already uses for video thumbnails.
   */
  awaitingFrames?: { clipPath: string; sampleFps: number; expectedFrames: number };
  /**
   * A proposal waiting at the review screen.
   *
   * Everything the screen needs is here, so opening a review is not a record
   * fetch: the clip to watch, the compiled preview of every sampled frame, and
   * which of them the selector would keep. Both paths are relative to the app
   * state directory, as every stored path is.
   */
  review?: {
    sampleCount: number;
    proposed: number[];
    /**
     * The real time each sampled moment held.
     *
     * Here so the review can play the frames the user has chosen at the speed
     * the build will give them. Without it the screen would have to invent a
     * flat rate, and a preview that plays at a rate the sequence will not be
     * built at is the one thing this screen must not do.
     */
    sampleDurationsMs: number[];
    loopWindow?: { from: number; to: number };
    previewDir: string;
    clipPath?: string;
    /**
     * When this proposal was made, as the previews' version.
     *
     * A redo writes new previews to the same paths, so a cache keyed on the
     * path alone would go on showing the previous clip's frames — with the new
     * clip playing above them.
     */
    proposedAt: number;
  };
}

/** One video model the user can pick, with its measured character (D29). */
export interface VideoModelChoice {
  /** The provider's endpoint id. Opaque everywhere but the adapter. */
  id: string;
  name: string;
  /** What it does, measured — not a recommendation. */
  strength: string;
  /** What it costs you, measured. */
  cost: string;
  /** Whether it accepts an end frame, which is the open loop lead (§12.1). */
  endFrame: boolean;
}

export interface SpriteStudioSettings {
  /** The video model chosen last time. Remembered and used next time (D29). */
  videoModel: string;
  /** The model single frames are repaired with. */
  repairModel: string;
  /**
   * 720p is the default and the resolution question is closed (D31).
   *
   * 480p is here for the end-to-end test, which cares that the pipeline runs
   * rather than that the sprite is good, and 480p is quicker and cheaper.
   */
  resolution: '480p' | '720p' | '1080p';
  /** How many clips may be in flight at once. */
  concurrency: number;
  /** Frames sampled per second of clip. */
  sampleFps: number;
}

export const DEFAULT_SPRITE_STUDIO_SETTINGS: SpriteStudioSettings = {
  videoModel: 'xai/grok-imagine-video/image-to-video',
  repairModel: REPAIR_MODEL,
  resolution: '720p',
  // Three at once: enough to keep a batch moving, low enough that a mistake
  // costs three clips rather than five.
  concurrency: 3,
  sampleFps: 12,
};

/**
 * A plan the AI wrote, waiting for the user to accept it.
 *
 * Held in state rather than returned from the request, because planning takes a
 * model call and the dialog has to be able to show its result whenever it
 * arrives — including to a page that was reopened while it was thinking.
 * Nothing is generated from a plan until the user accepts it.
 */
export type PlanResult =
  | { status: 'ok'; animations: import('./character').AnimationPlan[] }
  | { status: 'failed'; reason: string }
  | { status: 'cancelled'; reason: string };

export interface SpriteStudioState {
  characters: CharacterSummary[];
  animations: AnimationSummary[];
  /** Keyed by the plan id the page allocated when it asked. */
  plans: Record<string, PlanResult>;
  /**
   * The last thing that went wrong, in words the user can act on.
   *
   * Requests are applied in the background, so a failure has nowhere else to
   * appear: the page asked, the runtime refused, and without this the button
   * simply does nothing — which is what happened, and what took a log file to
   * explain. An animation carries its own error; this is for everything that
   * has no record to carry one yet, and ingestion is most of it.
   *
   * It carries finished work as well as failures — an export writes two files
   * and has no row of its own to say so from — hence the tone.
   */
  notice?: { message: string; at: number; tone: 'problem' | 'done' };
  settings: SpriteStudioSettings;
  /** The character the page is looking at. */
  openCharacterId?: string;
  openAnimationId?: string;
}

export const DEFAULT_SPRITE_STUDIO_STATE: SpriteStudioState = {
  characters: [],
  animations: [],
  plans: {},
  settings: DEFAULT_SPRITE_STUDIO_SETTINGS,
};

/**
 * Intent, appended by the UI and applied by the runtime.
 *
 * Ids are allocated by the caller for anything that creates a record: the
 * request log is applied at-least-once, and an id chosen by the handler would
 * make a replay produce a second character — or a second paid-for clip.
 */
export type SpriteRequestBody =
  /**
   * Turn a staged picture into a character, measuring it first (spec §2.1).
   *
   * `stagingKey` names bytes the page has already pushed across; see
   * `runtime/staging.ts` for why Sprite Studio stages its own files.
   */
  | { kind: 'sprite.character.create'; characterId: string; name: string; stagingKey: string }
  /** Draw the base character from words, then measure that (spec §2.1). */
  | { kind: 'sprite.character.create-from-text'; characterId: string; name: string; description: string }
  /** Make a character from a picture already in the Library. */
  | { kind: 'sprite.character.create-from-item'; characterId: string; name: string; itemId: string }
  | { kind: 'sprite.character.re-measure'; characterId: string }
  /** Cap the palette and re-quantise, so the result is visible before approval. */
  | { kind: 'sprite.character.set-cap'; characterId: string; cap: PaletteCap }
  | { kind: 'sprite.character.rename'; characterId: string; name: string }
  | { kind: 'sprite.character.set-export-scale'; characterId: string; scale: number }
  | { kind: 'sprite.character.set-style-notes'; characterId: string; notes: string }
  /**
   * Take out background the drawing closed around, or put it back.
   *
   * Re-measures from the kept original either way, so it is a choice rather
   * than a one-way edit — the same shape as capping the palette (D17).
   */
  | { kind: 'sprite.character.fill-enclosed'; characterId: string; fill: boolean }
  /** The first checkpoint. Nothing is generated until this lands (D5). */
  | { kind: 'sprite.character.approve'; characterId: string }
  | { kind: 'sprite.character.favourite'; characterId: string; favourite: boolean }
  | { kind: 'sprite.character.delete'; characterId: string }
  | { kind: 'sprite.character.restore'; characterId: string }
  | { kind: 'sprite.character.purge'; characterId: string }
  /**
   * Ask for animations in plain words. The runtime plans them with the AI and
   * writes the plan back for the dialog to show before a penny is spent.
   */
  | { kind: 'sprite.plan'; characterId: string; planId: string; request: string; videoModel: string }
  /** Start the animations the user accepted, with the plan they edited. */
  | {
      kind: 'sprite.generate';
      characterId: string;
      videoModel: string;
      animations: { animationId: string; plan: import('./character').AnimationPlan }[];
    }
  /**
   * Frames the page pulled out of a clip the runtime cannot decode.
   *
   * `durationsMs` is the real time each sampled frame held, so the source timing
   * survives into the finished animation rather than being replaced by a rate
   * chosen afterwards (D23).
   */
  | { kind: 'sprite.frames.attach'; animationId: string; stagingKey: string; durationsMs: number[] }
  /**
   * The frames the user kept at the review, as indices into the sampled clip.
   *
   * Indices rather than pictures: the samples are already staged, and the page
   * does not compute durations — a chosen frame holds until the next chosen
   * frame, which is a rule the engine owns.
   */
  | {
      kind: 'sprite.frames.choose';
      animationId: string;
      indices: number[];
      /**
       * How the user set it playing at the review, when they changed it.
       *
       * The review shows the frames playing, so the way they play is a thing
       * the user is looking at while deciding — and a control on that screen
       * that moved the preview and not the result was showing one animation
       * and building another. Absent means "leave the plan alone".
       */
      loop?: LoopMode;
    }
  /**
   * The page could not open the clip.
   *
   * Decoding is the only way out of `awaiting-frames`, so a clip this renderer
   * has no codec for would otherwise sit under a spinner for ever — on this
   * session and on every session after it. Saying so moves the animation to
   * `failed`, where it can be run again.
   */
  | { kind: 'sprite.frames.failed'; animationId: string; reason: string }
  | { kind: 'sprite.animation.approve'; animationId: string }
  | { kind: 'sprite.animation.cancel'; animationId: string }
  | { kind: 'sprite.animation.delete'; animationId: string }
  | { kind: 'sprite.animation.set-loop'; animationId: string; loop: LoopMode }
  | { kind: 'sprite.animation.set-play-rate'; animationId: string; playRate: number }
  | { kind: 'sprite.animation.rename'; animationId: string; name: string }
  /**
   * Ask the AI to fix something, with or without saying what is wrong (D18).
   *
   * Available on every frame and every animation at all times, not only when a
   * check failed: a frame can pass every measurement and still be wrong to the
   * eye, and no measurement will ever raise it.
   */
  | { kind: 'sprite.fix'; animationId: string; frameId?: string; instruction: string }
  /** Run the whole sequence again from an amended instruction. */
  | { kind: 'sprite.animation.redo'; animationId: string; instruction: string }
  /** A hand edit: the cells the frame editor produced, palette-locked. */
  | { kind: 'sprite.frame.write'; animationId: string; frameId: string; stagingKey: string }
  | { kind: 'sprite.frame.duplicate'; animationId: string; frameId: string; newFrameId: string }
  | { kind: 'sprite.frame.delete'; animationId: string; frameId: string }
  | { kind: 'sprite.frame.reorder'; animationId: string; frameIds: string[] }
  | { kind: 'sprite.frame.set-duration'; animationId: string; frameId: string; durationMs: number }
  | {
      kind: 'sprite.export';
      exportId: string;
      characterId: string;
      animationIds: string[];
      options: SpriteExportOptions;
    }
  | { kind: 'sprite.settings.update'; patch: Partial<SpriteStudioSettings> }
  /** Put the notice bar away. It stays until it is read, not on a timer. */
  | { kind: 'sprite.notice.dismiss' }
  | { kind: 'sprite.open'; characterId?: string; animationId?: string };

export interface SpriteExportOptions {
  /** Whole numbers only (D3). */
  scale: number;
  /**
   * A wanted pixel height instead of a multiple.
   *
   * Resolved to the nearest whole scale, and the real size is reported rather
   * than silently produced by a fractional one: a request for 512 px from a
   * 136 px character is 4× and 544 px, and saying so is the point (D3, §7).
   */
  height?: number;
  layout: 'rows' | 'single-row';
  /** Pad every animation up to the largest canvas, for engines wanting a grid. */
  uniformCell: boolean;
  trim: boolean;
  /** Where the two files go. */
  destination: { kind: 'workspace'; path: string } | { kind: 'downloads' };
}

export type SpriteRequestKind = SpriteRequestBody['kind'];

const SPRITE_REQUEST_KINDS: readonly SpriteRequestKind[] = [
  'sprite.character.create',
  'sprite.character.create-from-text',
  'sprite.character.create-from-item',
  'sprite.character.re-measure',
  'sprite.character.set-cap',
  'sprite.character.rename',
  'sprite.character.set-export-scale',
  'sprite.character.set-style-notes',
  'sprite.character.fill-enclosed',
  'sprite.character.approve',
  'sprite.character.favourite',
  'sprite.character.delete',
  'sprite.character.restore',
  'sprite.character.purge',
  'sprite.plan',
  'sprite.generate',
  'sprite.frames.attach',
  'sprite.frames.choose',
  'sprite.frames.failed',
  'sprite.animation.approve',
  'sprite.animation.cancel',
  'sprite.animation.delete',
  'sprite.animation.set-loop',
  'sprite.animation.set-play-rate',
  'sprite.animation.rename',
  'sprite.fix',
  'sprite.animation.redo',
  'sprite.frame.write',
  'sprite.frame.duplicate',
  'sprite.frame.delete',
  'sprite.frame.reorder',
  'sprite.frame.set-duration',
  'sprite.export',
  'sprite.settings.update',
  'sprite.notice.dismiss',
  'sprite.open',
] as const;

export function isSpriteRequestKind(value: unknown): value is SpriteRequestKind {
  return typeof value === 'string' && (SPRITE_REQUEST_KINDS as readonly string[]).includes(value);
}

export function isSpriteRequest(body: { kind: string }): body is SpriteRequestBody {
  return isSpriteRequestKind(body.kind);
}

/** Fill in anything a stored state file predates, without losing what it holds. */
export function normalizeSpriteState(value: unknown): SpriteStudioState {
  if (typeof value !== 'object' || value === null) return structuredClone(DEFAULT_SPRITE_STUDIO_STATE);
  const raw = value as Partial<SpriteStudioState>;
  return {
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    animations: Array.isArray(raw.animations) ? raw.animations : [],
    plans: typeof raw.plans === 'object' && raw.plans !== null ? raw.plans : {},
    settings: { ...DEFAULT_SPRITE_STUDIO_SETTINGS, ...(raw.settings ?? {}) },
    ...(raw.notice === undefined ? {} : { notice: raw.notice }),
    ...(raw.openCharacterId === undefined ? {} : { openCharacterId: raw.openCharacterId }),
    ...(raw.openAnimationId === undefined ? {} : { openAnimationId: raw.openAnimationId }),
  };
}
