/**
 * The authoring guide — the system material handed to an LLM (or a person)
 * writing a character against this engine. Exported as a string so it
 * versions in lockstep with the API it teaches and needs no filesystem at
 * runtime. Distilled from the Godot original's ANIMATION.md, re-grounded in
 * this package's TypeScript API and the lessons of the spike.
 *
 * Code examples use indented blocks, not fences, so the template literal
 * needs no escaping.
 */

export const AUTHORING_GUIDE = `# Ink & Bones — authoring a character

You are writing ONE TypeScript file. It imports from '@sero-ai/ink-and-bones'
and exports a build function returning a CharacterSpec. The engine does the
rest: it evaluates your skeleton and curves, composites the painted parts at
4x supersample, simulates the cloth, and grades everything down onto the 1x
pixel grid — palette-quantized, despeckled, ink-outlined — deterministically.
A character is a program: every number you write is a named dial.

The file shape:

    import type { CharacterSpec, Color, Part, Pose, Vec } from '@sero-ai/ink-and-bones';
    import { Motion, Paint, Skeleton, hex } from '@sero-ai/ink-and-bones';

    export function buildCharacter(): CharacterSpec {
      const S = new Skeleton();
      // ... bones, chains, parts, clips ...
      return { canvasW, canvasH, groundRow, skeleton: S, parts, clips, grade, shadow, restPose };
    }

## Coordinates and signs — read this twice, it is where authors fail

- The 1x canvas is FIXED (canvasW x canvasH, e.g. 64 x 80). All skeleton,
  paint, and plant coordinates are SUPERSAMPLED px: 4x the 1x canvas, so a
  64 x 80 canvas is a 256 x 320 working space. Screen-down is +Y.
- A bone's local frame: origin at its joint, +Y along the bone. With all
  angles 0, +Y points screen-down.
- Angles are degrees. Positive swings the tip EAST for a downward bone
  (legs, arms). For an UPWARD bone (spine, head; rest around 158-186) the
  sign flips past vertical: positive rotates the tip WEST. To lean a spine
  east, key NEGATIVE. This trap put the first ever character bolt-upright.
- On upward bones, local +X is screen-west; the chest or face 'front' is
  -X. Foot bones point toe-ward (rest 90 = toe east): +Y = toe, -X = sole.
- A pose is { deg: { boneName: deltaDeg }, root?: [x, y] }. Unmentioned
  bones sit at rest; clips author DELTAS, the rest angles carry the
  identity pose.
- Nothing auto-pads. Every clip's full excursion must stay 1px inside the
  canvas or the 'edge' audit fires. Budget reach BEFORE authoring: a long
  blade or tail cannot point anywhere near horizontal from a pivot close to
  the canvas edge.

## The skeleton

    S.rootPos = [128, 222];                       // pelvis, ss px
    S.bone('pelvis', '', [0, 0], 0, 0);           // name, parent, pivot, restDeg, length
    S.bone('thigh_near', 'pelvis', [9, 2], 0, 40);
    S.bone('shin_near', 'thigh_near', S.tip(), 0, 40);   // S.tip() = end of the bone just added
    S.bone('foot_near', 'shin_near', S.tip(), 90, 13);   // feet rest at 90: toe east
    S.bone('spine', 'pelvis', [0, -2], 172, 44);         // upward: rest past vertical

- Root height sets the knee bend everywhere: if the ankle plants at y = 296
  and the legs reach 80, a root at 222 leaves near-straight standing legs
  that still have flex to spend in a run. Leave 8-12 ss px of slack.
- Near/far limb pairs are separate bones ('thigh_near', 'thigh_far') offset
  a few ss px apart at the hip and shoulder, drawn far-side first.

Cloth is declared on the skeleton, simulated by the engine:

    S.chain('scarf', 'chest', [7, 26], 7, 11, [-850, 0], 3000, 0.975, 0.15, 0.22, [0.45, -1]);
    //       name    bone    anchor  links len  wind     gravity damp  taper stiff restDir

## Painting and the ramp law

Each part paints ONCE, in bone-local ss space, on a Paint canvas:

    function shin(suit: Color[]): Paint {
      const p = new Paint({ x: -8, y: -2, w: 16, h: 48 });   // bone-local rect
      p.capsule([0, 2], [0, 40], 6.5, 4.5, suit[1]);         // p0, p1, r0, r1, colour
      p.tintToward([-0.7, -0.7], suit[0], 2.5);              // light from up-west
      p.tintToward([0.7, 0.7], suit[2], 2.5);                // shade down-east
      return p;
    }

Helpers: capsule (tapered limb segments — the workhorse), disc, stroke,
ribbon (for chain painters), tintToward (directional light: pushes edge
bands toward a colour), occludeAbove (contact shadow under an overhang).

stroke and ribbon take a LIST of points, never two endpoints:

    p.stroke([[0, 2], [4, 12], [6, 24]], [3, 2.5, 2], c);  // points, widths
    p.ribbon(pts, 7, 2.8, c);                              // points, w0, w1

For a single straight segment, use capsule(p0, p1, r0, r1, c).

THE RAMP IS THE LAW. A part declares its ramp — every colour it may grade
to, usually [light, mid, dark]. The quantizer snaps each 1x cell to the
OWNING part's ramp, so chrome can never bleed into suit — and a colour you
paint but leave out of the ramp is quantized away or flagged by the 'ramp'
audit. Paint big and smooth: broad capsules and tintToward shading grade
into deliberate pixel clusters; pixel-level detail belongs to the grade,
not the painter. Keep ribbon and stroke tips at least 2.5 ss px of
half-width or they grade to speckle.

Parts list is back-to-front (far limbs, body, near limbs, head):

    { name: 'shin_near', bone: 'shin_near', ramp: suit, paint: shin(suit) },     // rigid
    { name: 'scarf', chain: 'scarf', ramp: scarfRamp, painter: scarfPainter },   // cloth

A chain part's painter is CALLED BY THE ENGINE as painter(paint, points):
a fresh Paint canvas first, then the simulated link positions, every frame.
Draw onto the GIVEN paint — never create or return your own:

    const scarfPainter = (p: Paint, pts: readonly Vec[]): void => {
      p.ribbon(pts, 7, 2.8, scarf);
      p.tintToward([-0.4, -1], scarfLight, 2.2);
    };

grade config: { ink, shadow, emissiveLone } — ink is the 1px outline colour,
emissiveLone lists hot accent colours (visor core, blade edge) allowed to
win a cell outright at ~1/3 coverage and to stand as a single pixel.
Colours come from hex('4e5f78') — exactly six digits, never a '#'.

## Clips are curves

    const run = new Motion('run', 0.6);        // name, cycle seconds; loops by default
    run.bakeFps = 15;                          // loops read best at 12-15; must be in (0, 60]
    run.wind = [-1600, 0];                     // extra wind on every chain, this clip only
    run.gait('thigh_near', 'shin_near', 'foot_near', 88, 26, 0.0, 296, 8);
    run.gait('thigh_far',  'shin_far',  'foot_far',  88, 26, 0.5, 296, -8);
    run.key('root_y', { 0.0: 0, 0.15: -8, 0.3: 0, 0.45: -8 });
    run.key('spine', { 0.0: -5, 0.15: -8, 0.3: -5, 0.45: -8 });
    clips.set('run', run);
    clips.set('run_west', Motion.mirror('run_west', 'run', run));

- key(channel, { seconds: value }, ease) — a bone name (delta deg) or
  'root_x' / 'root_y' (ss px). Eases: 'sine' (default), 'linear', 'step',
  'outBack'. Loops interpolate across the wrap; non-loops clamp.
- gait(upper, lower, end, stride, lift, phase, groundY, hipX, contact) —
  cyclic feet: you author the foot path, IK solves hip, knee, ankle.
  Opposite legs are the same gait at phase + 0.5. Feet plant in WORLD
  space, so root_y bobs the body over planted boots and the knees absorb
  it. contact is the fraction of the cycle the foot is DOWN, and it alone
  decides whether the clip can fly: two legs at the 0.6 default cover 120%
  of the cycle, so a flight phase is arithmetically impossible. A sprint
  passes about 0.30 (two flight windows) and sets airborne = true.
- plant(upper, lower, end, { seconds: [x, y, endWorldDeg] }) — keyed IK
  targets, the action-clip tool: a crouch, a stomp, a jump tuck is a
  handful of keyed positions. ANY clip that stands still must still plant
  its feet — an idle with unplanted IK legs dangles.
- layer(part, { seconds: zOffset }) — per-clip draw-order override,
  stepped: how a wound-up arm tucks behind the head, then cuts in front.
- Motion.mirror(westName, eastName, eastClip) — whole-frame flip at bake.
- wobbleBudget (default 2.5) is the in-place audit's allowance: how far the
  silhouette's centroid-x may stray from the clip's own mean, in 1x px. An
  action that deliberately commits its weight (a slash, a lunge) DECLARES
  its swing with a bigger budget on that clip; never starve the animation
  to fit the default and never touch other clips' budgets.
- airborne = true relaxes the baseline audit to: never below the rest
  baseline, at least one frame grounded, at least one frame clearly off
  the ground.
- clip.wind is constant; key('wind_x', ...) / key('wind_y', ...) override
  it per axis over the cycle — the only way cloth is DRAGGED across the
  body by a swing and then snaps back, instead of sitting blown one way.

## Cloth — the chain model

Chains integrate at a fixed 60 Hz, deterministically, warm-started so a
loop's frame 0 already sits on the steady state. Follow-through, overlap,
and a jump's apex drag-flip come from the sim: NEVER hand-key cloth.

- Rest hang is atan(|wind.x| / gravity) from vertical — the RATIO, not the
  wind's magnitude, decides whether cloth reads as fabric or as a plank.
- damp is per-step at 60 Hz: 0.92 keeps only 0.7% of velocity per second
  (snaps to equilibrium, cannot follow through); 0.975-0.985 keeps enough
  for one visible overshoot, then a settle.
- windTaper shields links near the anchor: link i feels
  taper + (1 - taper) * i / links of the field. A uniform field on rigid
  links has exactly one equilibrium — a straight line — so an untapered
  breeze can only produce a dead-straight chain, no matter how strong.
- stiffness + restDir pin the collar end toward a direction while the
  tapered wind bends the tip — that difference is what reads as cloth.
- Give two cloth pieces different natural periods (period grows with
  sqrt(total length)) AND different hang angles, or they swing in lockstep
  and grade into one doubled line.

## groundRow — measure it, never eyeball it

groundRow is the lowest opaque row (ink outline included) of the REST
frame. Feet planted at y = 296 ss put the sole at row 74 at 1x, and the
outline under the boots adds one: groundRow 75. If the baseline audit
reports feet at a row other than your declared groundRow, the MEASURED
number in the report is the truth — update the declaration or fix the
plant, whichever you actually intended.

restPose() must plant the IK legs or they dangle at rest:

    function restPose(): Pose {
      const pose: Pose = { deg: {} };
      S.solveChain(pose, 'thigh_near', 'shin_near', [137, 296], 1, 'foot_near', 90);
      S.solveChain(pose, 'thigh_far', 'shin_far', [119, 296], 1, 'foot_far', 90);
      return pose;
    }

## The audit gates — how to read a failure

Every bake is audited per clip. Respond to the CHECK, not the symptom:

- valid — no frames, or frames off the declared canvas. Contract bug.
- distinct — a frame graded to almost nothing; usually a part painted
  outside its rect or a ramp of near-identical colours.
- wrap — a loop's last frame is far from its first: a channel keyed with
  different start and end values. Loops interpolate across the wrap; make
  the motion cyclic instead of keying t=0 and t=cycle separately.
- islands — disconnected pixel clusters: a part drifted free of the body
  (bad pivot or a paint rect that misses the bone), or speckle upstream.
- in-place — centroid-x wobble over wobbleBudget: the clip walks sideways.
  Either the gait's stride/hipX is asymmetric by accident, or the motion
  genuinely commits weight — then declare the budget on that clip.
- baseline — feet off groundRow (grounded clips), or an airborne clip
  that sinks below the rest baseline or never actually leaves the ground.
  Fix the plant y, the gait groundY, or the declaration — see above.
- edge — the silhouette touches the canvas margin. Shrink the excursion or
  move the root; do not resize the canvas to chase one clip.
- speckle — lone pixels outside emissiveLone: paint tips too thin (under
  2.5 ss px half-width) or shading bands too narrow.
- ramp — a graded colour missing from the owning part's ramp: you painted
  with a colour the part never declared. Add it to the ramp or paint with
  a declared one.

The audit is structural. It cannot see value collapse: the review strips
exist so you LOOK at the frames — can you find the far arm against the
chest, the far leg against the near, in every frame? If a part vanishes
into its neighbour, push its ramp a step lighter or darker, or shade the
boundary with tintToward.

## Reading at a glance — the bar the audits cannot measure

A character is finished only when a STRANGER names it at a glance. The
audits measure structure; they cannot see identity. Judge your own
pictures like a stranger:

- Silhouette first: the outline alone must say what the character is.
  Big shape cues — a helmet, a hat, ears, a weapon — beat any amount of
  surface detail. If the filled-black outline would stump a stranger,
  no colouring will save it.
- The head must read as a head: roughly the top quarter of the figure,
  visibly narrower than the shoulders, with at least one face mark (an
  eye line, a visor slit) in a colour that contrasts with the head.
- Contrast separates parts: parts that touch need ramps at least a step
  apart in value, or they grade into one mass. A torso and a near arm
  in the same mid tone become a slab.
- Props read by silhouette too: a sword is a long straight edge held
  away from the body, a shield a broad plate on the outline — a prop
  overlapping the torso disappears.
- Before you finish, describe the pictures as a stranger would, without
  the brief. If that description does not name the character, keep
  working. Green gates are the floor, not the finish — spend the bake
  budget you have on readability.

## Working method

1. Skeleton + rest pose + one part first; groundRow from the measured rest.
2. Parts back-to-front, checking the rest frame after each: silhouette
   first, then ramps and light.
3. Clips one at a time: idle (subtle root_y bob, planted feet), then run,
   then actions. Fix compile errors first, then audit failures in the
   order above, then judge the strips by eye.
4. Change few numbers per iteration and keep the ones that worked; the
   bake is deterministic, so every change you see is one you made.
`;
