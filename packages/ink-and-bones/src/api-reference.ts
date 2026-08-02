/**
 * The engine's authoring surface as TypeScript declarations — GENERATED.
 *
 * Do not edit: run `pnpm build:api` in this package. See
 * scripts/build-api-reference.mjs for why this exists and what it omits.
 */

export const API_REFERENCE = `// ---- vec ---------------------------------------------------------------

/**
 * Minimal 2D math for the Ink & Bones port: vectors as plain \`[x, y]\` pairs
 * and rigid affine transforms (rotation + translation), matching Godot's
 * Transform2D closely enough that the skeleton code ports line for line.
 *
 * Convention carried over from the Godot original: an "api angle" of 0 points
 * screen-DOWN and positive swings the tip EAST. \`fromRot\` negates the angle
 * exactly as skeleton.gd does, so \`apply(fromRot(deg), [0, 1])\` equals
 * \`unit(deg)\`.
 */
export type Vec = readonly [number, number];
/** Column-major 2x3 affine: apply(p) = (a·x + c·y + tx, b·x + d·y + ty). */
export interface Affine {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}
export declare const degToRad: (deg: number) => number;
export declare const radToDeg: (rad: number) => number;
export declare const add: (p: Vec, q: Vec) => Vec;
export declare const sub: (p: Vec, q: Vec) => Vec;
export declare const scale: (p: Vec, s: number) => Vec;
export declare const dot: (p: Vec, q: Vec) => number;
export declare const len: (p: Vec) => number;
export declare const len2: (p: Vec) => number;
export declare const dist: (p: Vec, q: Vec) => number;
export declare function normalize(p: Vec): Vec;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const clamp: (v: number, lo: number, hi: number) => number;
export declare function smoothstep(edge0: number, edge1: number, x: number): number;
/** Positive modulo, as GDScript's fposmod. */
export declare const fposmod: (v: number, m: number) => number;
/** Unit vector of an api angle: 0 -> down, 90 -> east. */
export declare function unit(apiDeg: number): Vec;
/**
 * A transform rotating by an API angle (negated internally, the skeleton.gd
 * trick) with its origin at \`origin\`.
 */
export declare function fromRot(apiDeg: number, origin: Vec): Affine;
export declare const identity: () => Affine;
/** Composition: (mul(A, B))(p) = A(B(p)). */
export declare function mul(A: Affine, B: Affine): Affine;
export declare const apply: (T: Affine, p: Vec) => Vec;
/** Rotation only, no translation — Godot's basis_xform. */
export declare const basisXform: (T: Affine, p: Vec) => Vec;
/** Inverse of a rigid transform (rotation + translation only). */
export declare function inverse(T: Affine): Affine;

// ---- img ---------------------------------------------------------------

/**
 * A float RGBA pixel buffer, 0..1 per channel — the Image stand-in for the
 * whole pipeline. Floats, not bytes, because parts are composited with alpha
 * and bilinear sampling before the grade quantizes everything back to exact
 * palette bytes at the very end.
 */
export type Color = readonly [number, number, number, number];
export declare const TRANSPARENT: Color;
/** Palette entries are authored as hex, exactly like art/palette.gd. A
 * malformed string would paint NaN and still grade "clean", so it throws. */
export declare function hex(rgb: string, alpha?: number): Color;
/** The tolerance Godot's is_equal_approx uses for the emissive checks. */
export declare function sameColor(a: Color, b: Color): boolean;
export declare function darkened(c: Color, amount: number): Color;
export declare function shade(c: Color, amount: number): Color;
/** The largest canvas the engine will allocate (pixels). Nothing legitimate
 * comes near it — the biggest supersampled canvas is ~400k px and the widest
 * review strip ~8M — while a mistaken dimension (a 1x value scaled twice, an
 * ss value squared) blows past it immediately. Every pixel buffer in the
 * engine is an Img, so this one throw bounds them all. */
export declare const MAX_IMG_PIXELS: number;
export declare function limitImgAllocations(maxTotalPixels: number): void;
export declare class Img {
    readonly w: number;
    readonly h: number;
    readonly data: Float32Array;
    constructor(w: number, h: number);
    get(x: number, y: number): Color;
    alpha(x: number, y: number): number;
    set(x: number, y: number, c: Color): void;
    inside(x: number, y: number): boolean;
    /** Source-over blend of \`c\` onto the pixel. */
    blend(x: number, y: number, c: Color): void;
    /** Blend a whole image over this one at (0,0) — Image.blend_rect. */
    blendImage(src: Img): void;
    /** The frame as 8-bit RGBA rows — what a canvas ImageData or PNG encoder
     * wants. The engine never draws; callers take these bytes and do. */
    toRGBA8(): Uint8ClampedArray<ArrayBuffer>;
    flippedX(): Img;
}

// ---- paint -------------------------------------------------------------

/**
 * Ink & Bones — a painterly canvas for ONE part, in bone-local space.
 * Direct port of art/paint.gd.
 *
 * A part is painted once, at supersampled resolution (compositor SS = 4), in
 * the local frame of the bone it binds to: origin at the joint, +Y along the
 * bone. The part never knows it will be rotated. Shapes should be smooth and
 * generous — tapered capsules, broad shading — the grade makes the pixels.
 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Supersampled px per 1x pixel — mirrors the compositor's SS, which cannot be
 * imported here without a cycle (the compositor imports this file). A test
 * pins the two together. */
export declare const SS_PER_PIXEL = 4;
export declare class Paint {
    readonly img: Img;
    /** Where local (0,0) — the bone joint — sits in img pixels. */
    readonly origin: Vec;
    constructor(rect: Rect);
    /** Tapered capsule from p0 (radius r0) to p1 (radius r1) — the workhorse. */
    capsule(p0: Vec, p1: Vec, r0: number, r1: number, c: Color): void;
    /** The unchecked capsule the other helpers fill through, once their own
     * arguments are validated — guards belong at the author's call, not in an
     * inner loop. */
    disc(center: Vec, r: number, c: Color): void;
    /**
     * A filled polygon — the shape tool capsules cannot be: a helmet's flat
     * crown and angled brow, a shield's kite, a blade's taper. Even-odd fill of
     * the closed path through \`points\`; concave outlines and notches are fine.
     */
    polygon(points: readonly Vec[], c: Color): void;
    /** Polyline stroke with a per-point half-width profile. */
    stroke(points: readonly Vec[], widths: readonly number[], c: Color): void;
    /** A stroke tapering linearly from w0 to w1 — the shape of a chain. */
    ribbon(points: readonly Vec[], w0: number, w1: number, c: Color): void;
    /**
     * Recolor pixels within \`depth\` of the silhouette edge on the side the
     * shape faces \`dir\` — lit and shaded sides, or a rim at a shallow depth.
     */
    tintToward(dir: Vec, c: Color, depth: number): void;
    /**
     * Stamp ready-made pixels into this part, \`scale\` supersampled px per source
     * pixel, with \`at\` naming where the source's TOP-LEFT sits in bone-local
     * space.
     *
     * The other helpers describe a shape and let the grade make the pixels. This
     * one carries pixels somebody else already decided — artwork cut from a
     * reference, a tile, a stamp — and it exists because describing a shape in
     * coordinates is a poor way to draw. A character can mix the two freely: a
     * bitmap torso under a procedural cloak is one parts list.
     *
     * Every colour stamped must be in the part's declared ramp, exactly as if it
     * had been painted; the ramp law does not bend for borrowed pixels, and the
     * 'ramp' audit will say so if it is broken. Fully transparent source pixels
     * are skipped, so a cut-out keeps its silhouette.
     */
    image(src: Img, at: Vec, scale?: number): void;
    /** Darken toward local y = atY on the joint side — sells the joint. */
    occludeAbove(atY: number, depth: number, amount: number): void;
}

// ---- skeleton ----------------------------------------------------------

/**
 * Ink & Bones — the bone hierarchy behind a puppet. Direct port of
 * art/skeleton.gd: FK transforms, 2-bone IK, verlet chain declarations.
 *
 * All coordinates are SUPERSAMPLED px (4x the 1x canvas). A bone's local
 * frame has its origin at the joint and +Y along the bone; with every angle
 * at 0, +Y is screen-down. Angles are degrees; positive swings the tip EAST.
 * A pose maps bone name -> delta degrees, plus a root offset.
 */
export interface Pose {
    deg: Record<string, number>;
    root?: Vec;
}
export interface ChainDef {
    bone: string;
    anchor: Vec;
    links: number;
    len: number;
    wind: Vec;
    gravity: number;
    damp: number;
    windTaper: number;
    stiffness: number;
    restDir: Vec;
}
export declare class Skeleton {
    readonly chains: Map<string, ChainDef>;
    rootPos: Vec;
    bone(name: string, parent: string, pivot: Vec, restDeg: number, length?: number): void;
    /** The tip of the most recently declared bone — the natural child pivot. */
    tip(): Vec;
    chain(name: string, bone: string, anchor: Vec, links: number, linkLen: number, wind?: Vec, gravity?: number, damp?: number, windTaper?: number, stiffness?: number, restDir?: Vec): void;
    hasBone(name: string): boolean;
    names(): readonly string[];
    lengthOf(name: string): number;
    /** World api angle (degrees, positive = east) of \`name\` under \`pose\`. */
    worldDeg(name: string, pose: Pose): number;
    /** World transform of every bone: bone-local paint space -> ss canvas. */
    transforms(pose: Pose): Map<string, Affine>;
    /**
     * 2-bone IK: rotate upper/lower so the lower's tip reaches \`target\` (world
     * ss px), writing deltas into \`pose\`. \`bend\` +1 bends the joint EAST (a
     * knee), -1 west (an elbow). Optionally aims an end bone at a world angle.
     */
    solveChain(pose: Pose, upper: string, lower: string, target: Vec, bend?: number, endBone?: string, endWorldDeg?: number): void;
}
/** Convert a WORLD direction into \`bone\`'s local frame at a given pose. */
export declare function worldDirToLocal(skel: Skeleton, pose: Pose, bone: string, dir: Vec): Vec;
export { apply };

// ---- motion ------------------------------------------------------------

/**
 * Ink & Bones — a clip as EASED CURVES over a skeleton, not a frame table.
 * Direct port of art/motion.gd.
 *
 * Channels key bone rotations (degrees) or the root offset at times in
 * seconds; feet are driven by authored FOOT PATHS whose hip/knee angles fall
 * out of 2-bone IK. Frame counts are a SAMPLING decision (bakeFps), made at
 * bake time.
 */
export type Ease = 'linear' | 'sine' | 'step' | 'outBack';
export declare class Motion {
    readonly name: string;
    /** Cycle length in seconds. */
    readonly cycle: number;
    readonly loop: boolean;
    /** Loops read best at 12-15 fps; actions on twos at 24 with holds. */
    bakeFps: number;
    airborne: boolean;
    /** In-place tolerance: how far (1x px) the silhouette's centroid-x may
     * stray from the clip's own mean before the audit calls it a sideways
     * walk. A deliberate lunge declares a bigger budget. */
    wobbleBudget: number;
    /** Extra wind this clip adds to every verlet chain (ss px/s^2). */
    wind: Vec;
    /** Set on a mirror clip: the east clip whose frames this one flips. */
    mirrorOf: string;
    constructor(name: string, cycleSeconds: number, looping?: boolean);
    /** Key one channel: a bone name (delta deg) or "root_x" / "root_y" (ss px). */
    key(channel: string, keys: Record<number, number>, ease?: Ease): void;
    /**
     * Author a foot path; IK does the rest. \`contact\` is the fraction of the
     * cycle the foot is DOWN — it alone decides whether the clip can fly.
     */
    gait(upper: string, lower: string, end: string, stride: number, lift: number, phase: number, groundY: number, hipX?: number, contact?: number): void;
    /** Per-clip draw-order override; stepped — depth changes are cuts. */
    layer(part: string, keys: Record<number, number>, ease?: Ease): void;
    zOffsets(t: number): Map<string, number>;
    /**
     * KEYED IK targets for a limb chain — the action-clip tool. \`keys\` maps
     * seconds to [x, y, endWorldDeg] in ss canvas coordinates.
     */
    plant(upper: string, lower: string, end: string, keys: Record<number, [number, number, number]>, ease?: Ease, bend?: number): void;
    /** A west-facing clip: the whole-frame mirror of \`srcName\`, flipped at bake. */
    static mirror(mirrorName: string, srcName: string, template: Motion): Motion;
    /** The wind driving the chains at \`t\` — keyable per axis via wind_x/wind_y. */
    windAt(t: number): Vec;
    /** The full pose at \`t\` seconds, with every gait and plant solved. */
    poseAt(t: number, skel: Skeleton): Pose;
}

// ---- compositor --------------------------------------------------------

/**
 * Ink & Bones — evaluate, composite at SSx, then GRADE down to the pixel
 * grid. Direct port of art/compositor.gd.
 *
 * The grade pass is where "hand-painted" is reconciled with "pixel art":
 *   1. box-downsample SSx -> 1x
 *   2. quantize each pixel to the RAMP of the part that owns it
 *   3. despeckle to a fixpoint (emissives exempt)
 *   4. one 1px INK silhouette, LAST
 */
export { settleChains, simulateChains };
export declare const SS = 4;
export interface RigidPart {
    name: string;
    bone: string;
    paint: Paint;
    ramp: readonly Color[];
}
export interface ChainPart {
    name: string;
    chain: string;
    painter: (paint: Paint, points: readonly Vec[]) => void;
    ramp: readonly Color[];
}
export type Part = RigidPart | ChainPart;
export interface Shadow {
    x: number;
    y: number;
    rx: number;
    ry: number;
}
export interface GradeConfig {
    ink: Color;
    shadow: Color;
    /** Colours legal as a single pixel — hot emissive cores. */
    emissiveLone: readonly Color[];
}
/** Bake every frame of \`clip\` onto a 1x canvas of \`w1x\` x \`h1x\`. */
export declare function bake(skel: Skeleton, parts: readonly Part[], clip: Motion, w1x: number, h1x: number, cfg: GradeConfig, shadow?: Shadow): Img[];
/** The rest frame: chains settled under gravity, skeleton held at \`pose\`. */
export declare function renderRest(skel: Skeleton, parts: readonly Part[], pose: Pose, w1x: number, h1x: number, cfg: GradeConfig, shadow?: Shadow): Img;
/** One graded 1x frame. */
export declare function renderPose(skel: Skeleton, parts: readonly Part[], pose: Pose, w1x: number, h1x: number, cfg: GradeConfig, shadow?: Shadow, chains?: Map<string, Vec[]>, z?: Map<string, number>): Img;
/** A pixel with no same-color neighbour snaps to its most common opaque
 * 4-neighbour (or clears) — "cluster detail pixels", mechanically. Runs to a
 * fixpoint with immediate application, so paired speckles cannot oscillate.
 * Exported so the test net can prove the rule on a fixture directly. */
export declare function despeckle(img: Img, keep: readonly Color[]): void;

// ---- spec --------------------------------------------------------------

/**
 * The character contract — the shape every authored character file exports.
 *
 * A character is TypeScript source written against this package's API. Its
 * module exports a build function returning a \`CharacterSpec\`; everything the
 * engine does (bake, audit, review, play) starts from this one object. The
 * engine knows nothing about who authored it or where it is stored.
 */
export interface CharacterSpec {
    /** 1x canvas size in pixels. */
    canvasW: number;
    canvasH: number;
    /** The feet baseline: the lowest opaque row (outline included) of the rest
     * frame. The audit's ground truth for "standing on the ground". */
    groundRow: number;
    skeleton: Skeleton;
    parts: readonly Part[];
    clips: ReadonlyMap<string, Motion>;
    grade: GradeConfig;
    shadow?: Shadow;
    /**
     * The least of the canvas HEIGHT the figure may span, 0..1, measured on the
     * tallest frame of each clip. Every other size rule in the engine pushes one
     * way — the edge gate punishes drawing big and nothing punishes drawing
     * small — so an author with no floor shrinks until the character is a few
     * dozen pixels of mush. A deliberately squat character (a barrel, a slime)
     * DECLARES a lower floor; it is not a number to lower to fit a mistake.
     */
    minFill?: number;
    /** The standing pose the rest frame renders — usually a couple of IK
     * solves, so legs land exactly on the plant line. */
    restPose(): Pose;
}
/** A baked clip, mirrors already resolved to flipped frames. */
export interface BakedClip {
    name: string;
    frames: Img[];
    fps: number;
    loop: boolean;
}
/** Stable string key for an exact frame colour, e.g. "4e5f78" — the unit the
 * vocabulary and the graded-pixel checks compare in. */
export declare function colorKey(c: Color): string;
/**
 * The parts of the contract no audit gate can see. A grade or a shadow
 * declared with the wrong field names costs the character its ink or its
 * ground shadow SILENTLY — the frames still bake, the gates still pass. Both
 * are checked once per bake so the mistake reaches the author as an error.
 */
export declare function assertGradeAndShadow(grade: GradeConfig, shadow?: Shadow): void;
/** Every colour the character is allowed to emit: the union of the part
 * ramps, the ink, and the emissive accents. Derived, never declared — the
 * paints cannot drift from the law they are audited against. */
export declare function vocabulary(spec: CharacterSpec): Set<string>;
/** Bake one clip. A mirror clip bakes its source and flips every frame. */
export declare function bakeClip(spec: CharacterSpec, name: string): BakedClip;
/** Bake every clip the character declares. */
export declare function bakeAllClips(spec: CharacterSpec): Map<string, BakedClip>;
/** The rest frame: skeleton held at restPose, chains settled in still air. */
export declare function bakeRest(spec: CharacterSpec): Img;
`;
