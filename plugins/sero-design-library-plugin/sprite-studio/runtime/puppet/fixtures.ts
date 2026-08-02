/**
 * Authored-character sources for the puppet tests: a minimal character that
 * legitimately passes every audit gate, and broken variants that prove each
 * failure stage actually fires. Test-only; nothing in the runtime imports
 * this file.
 *
 * "Pip" is a 32x40 blob with one swinging arm — no chains, no IK — so a
 * whole compile-bake-audit round stays in tens of milliseconds. Its
 * groundRow is measured the way the guide teaches: from the baked rest
 * frame, outline included.
 */

export const CLEAN_SOURCE = `
import type { CharacterSpec, Part, Pose } from '@sero-ai/ink-and-bones';
import { Motion, Paint, Skeleton, hex } from '@sero-ai/ink-and-bones';

const LIGHT = hex('9ad1ff');
const MID = hex('4a90d9');
const DARK = hex('274e7a');
const INK = hex('151221');

export function buildCharacter(): CharacterSpec {
  const S = new Skeleton();
  S.rootPos = [64, 60];
  S.bone('body', '', [0, 0], 0, 60);
  S.bone('arm', 'body', [0, 20], 10, 30);

  const ramp = [LIGHT, MID, DARK];
  const body = new Paint({ x: -16, y: -4, w: 32, h: 80 });
  body.capsule([0, 4], [0, 58], 13, 11, MID);
  body.tintToward([-0.7, -0.7], LIGHT, 2.5);
  body.tintToward([0.7, 0.7], DARK, 2.5);
  const arm = new Paint({ x: -8, y: -4, w: 16, h: 40 });
  arm.capsule([0, 2], [0, 28], 5.5, 4.5, MID);
  arm.tintToward([0.7, 0.7], DARK, 2.5);

  const parts: Part[] = [
    { name: 'body', bone: 'body', ramp, paint: body },
    { name: 'arm', bone: 'arm', ramp, paint: arm },
  ];

  const idle = new Motion('idle', 1);
  idle.bakeFps = 4;
  idle.key('arm', { 0: -12, 0.5: 12 });

  const clips = new Map<string, Motion>();
  clips.set('idle', idle);

  function restPose(): Pose {
    return { deg: {} };
  }

  return {
    canvasW: 32,
    canvasH: 40,
    // Measured from the baked rest frame (restFeetRow), not eyeballed.
    groundRow: 32,
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: [0.03, 0.02, 0.1, 0.45], emissiveLone: [] },
    restPose,
  };
}
`;

export const SYNTAX_ERROR_SOURCE = `
import { Skeleton } from '@sero-ai/ink-and-bones';
export function buildCharacter() {
  const S = new Skeleton(;
  return S;
}
`;

export const FORBIDDEN_IMPORT_SOURCE = `
import { readFileSync } from 'node:fs';
export function buildCharacter() {
  return readFileSync('/etc/passwd');
}
`;

export const MISSING_EXPORT_SOURCE = `
import { Skeleton } from '@sero-ai/ink-and-bones';
export const notACharacter = new Skeleton();
`;

export const THROWING_SOURCE = `
export function buildCharacter() {
  throw new Error('deliberate failure from the fixture');
}
`;

export const HANGING_BUILD_SOURCE = `
export function buildCharacter() {
  for (;;) { /* an author's accidental forever */ }
}
`;

/** The hang hides in a painter callback the ENGINE calls during bake — the
 * case a naive "time out buildCharacter only" bound would miss. */
export const HANGING_PAINTER_SOURCE = `
import type { CharacterSpec, Pose } from '@sero-ai/ink-and-bones';
import { Motion, Skeleton, hex } from '@sero-ai/ink-and-bones';

export function buildCharacter(): CharacterSpec {
  const S = new Skeleton();
  S.rootPos = [64, 60];
  S.bone('body', '', [0, 0], 0, 60);
  S.chain('tail', 'body', [0, 10], 3, 8);
  const idle = new Motion('idle', 1);
  idle.bakeFps = 4;
  idle.key('body', { 0: -5, 0.5: 5 });
  const clips = new Map<string, Motion>();
  clips.set('idle', idle);
  return {
    canvasW: 32,
    canvasH: 40,
    groundRow: 33,
    skeleton: S,
    parts: [
      {
        name: 'tail',
        chain: 'tail',
        ramp: [hex('4a90d9')],
        painter: () => {
          for (;;) { /* hangs inside the compositor's callback */ }
        },
      },
    ],
    clips,
    grade: { ink: hex('151221'), shadow: [0, 0, 0, 0.4], emissiveLone: [] },
    restPose: (): Pose => ({ deg: {} }),
  };
}
`;

/** A valid character that ALSO floods the microtask queue — the classic vm
 * timeout escape. The bake must still land, and the flood must die with the
 * worker instead of wedging the runtime. */
export const ASYNC_FLOOD_SOURCE = `${CLEAN_SOURCE}
(async () => {
  for (;;) await Promise.resolve();
})();
`;

/** Allocates until the worker's memory ceiling stops it. Plain arrays on
 * purpose: typed-array backing stores live outside the old-gen limit that
 * `resourceLimits` enforces, and would time out instead of dying at the cap. */
export const MEMORY_HOG_SOURCE = `
export function buildCharacter() {
  const hoard: number[][] = [];
  for (;;) hoard.push(new Array(1_000_000).fill(Math.PI));
}
`;

/** P5: a clock or a random draw must fail loudly, not vary the bake. */
export const RANDOM_SOURCE = `
export function buildCharacter() {
  return { canvasW: 32 + Math.random() };
}
`;

/** Every clock spelling must be gone, not just Date.now. */
export const NEW_DATE_SOURCE = `
export function buildCharacter() {
  return { canvasW: new Date().getSeconds() };
}
`;

/** An engine-surface allocation blowup: the Paint canvas is an Img, and the
 * Img constructor is the cap. */
export const GIANT_PAINT_SOURCE = `
import { Paint } from '@sero-ai/ink-and-bones';
export function buildCharacter() {
  return new Paint({ x: 0, y: 0, w: 1_000_000, h: 1_000_000 });
}
`;

/** A restPose that rewrites a validated clip's timing after the contract
 * passed — the pinned scalars must make the assignment throw, not let a
 * five-second cap grow to a thousand. */
export const MUTATING_REST_POSE_SOURCE = `
import type { CharacterSpec, Pose } from '@sero-ai/ink-and-bones';
import { Motion, Paint, Skeleton, hex } from '@sero-ai/ink-and-bones';

export function buildCharacter(): CharacterSpec {
  const S = new Skeleton();
  S.rootPos = [64, 60];
  S.bone('body', '', [0, 0], 0, 60);
  const paint = new Paint({ x: -16, y: -4, w: 32, h: 80 });
  paint.capsule([0, 4], [0, 58], 13, 11, hex('4a90d9'));
  const idle = new Motion('idle', 1);
  idle.bakeFps = 4;
  idle.key('body', { 0: -5, 0.5: 5 });
  const clips = new Map<string, Motion>();
  clips.set('idle', idle);
  return {
    canvasW: 32,
    canvasH: 40,
    groundRow: 32,
    skeleton: S,
    parts: [{ name: 'body', bone: 'body', ramp: [hex('4a90d9')], paint }],
    clips,
    grade: { ink: hex('151221'), shadow: [0, 0, 0, 0.4], emissiveLone: [] },
    restPose: (): Pose => {
      (idle as { bakeFps: number }).bakeFps = 1000;
      return { deg: {} };
    },
  };
}
`;

/** Many SUB-limit canvases, retained: only the cumulative load-phase budget
 * sees this one. */
export const PAINT_HOARD_SOURCE = `
import { Paint } from '@sero-ai/ink-and-bones';
export function buildCharacter() {
  const hoard: Paint[] = [];
  for (;;) hoard.push(new Paint({ x: 0, y: 0, w: 1000, h: 1000 }));
}
`;

export const BAD_CONTRACT_SOURCE = `
export function buildCharacter() {
  return {
    canvasW: 9999,
    canvasH: -3,
    groundRow: 4,
    skeleton: { not: 'a skeleton' },
    parts: [],
    clips: new Map(),
    grade: null,
    restPose: 'nope',
  };
}
`;
