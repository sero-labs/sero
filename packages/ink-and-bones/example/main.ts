/**
 * The example page: bake a character's clips in the browser, play them on a
 * pixel-scaled canvas, and expose the dials that prove the point — a stride, a
 * wind, a whole theme — each a one-line change followed by a deterministic
 * rebake. This file is also the package's consumer smoke test: it only uses the
 * public API (plus the skeleton overlay's read access).
 *
 * It carries a CAST rather than one character on purpose. Scout, Rivet,
 * Vanguard and Husk use the same engine for cloth, machinery, an articulated
 * weapon and a body that is off-vertical by design.
 * Nothing below knows their internals: a cast member is a canvas size, some
 * themes, some named dials and a build function, and the clip buttons are read
 * off whatever it returns.
 */

import type { BakedClip, CharacterSpec, Img } from '../src/index';
import { ClipPlayer, SS, auditCharacter, bakeClip } from '../src/index';
import * as knight from './knight';
import * as scout from './scout';
import * as rivet from './rivet';
import * as husk from './husk';

const SCALE = 5;

/** One number a slider drives. `sign` is -1 for the winds, which read as a
 * positive strength and are applied westward. */
interface DialSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  sign: 1 | -1;
}

interface CastMember {
  id: string;
  name: string;
  blurb: string;
  canvasW: number;
  canvasH: number;
  themes: { label: string; value: unknown }[];
  dials: DialSpec[];
  defaults: Record<string, number>;
  build(theme: unknown, dials: Record<string, number>): CharacterSpec;
}

const CAST: CastMember[] = [
  {
    id: 'scout',
    name: 'Scout',
    blurb: 'Tapered capsules, a verlet scarf, a running gait.',
    canvasW: scout.CANVAS_W,
    canvasH: scout.CANVAS_H,
    themes: [
      { label: 'dusk', value: scout.DUSK },
      { label: 'ember', value: scout.EMBER },
    ],
    dials: [
      { key: 'stride', label: 'stride', min: 40, max: 130, sign: 1 },
      { key: 'runWind', label: 'scarf wind', min: 0, max: 12000, sign: -1 },
    ],
    defaults: { ...scout.DEFAULT_DIALS },
    build: (theme, dials) =>
      scout.buildCharacter(theme as scout.Theme, dials as unknown as scout.Dials),
  },
  {
    id: 'rivet',
    name: 'Rivet',
    blurb: 'Flat polygon panels, a stiff antenna, a plod — and one clip that does not loop.',
    canvasW: rivet.CANVAS_W,
    canvasH: rivet.CANVAS_H,
    themes: [
      { label: 'rust', value: rivet.RUST },
      { label: 'moss', value: rivet.MOSS },
    ],
    dials: [
      { key: 'stride', label: 'stride', min: 20, max: 90, sign: 1 },
      { key: 'antennaWind', label: 'antenna wind', min: 0, max: 3000, sign: -1 },
    ],
    defaults: { ...rivet.DEFAULT_DIALS },
    build: (theme, dials) =>
      rivet.buildCharacter(theme as rivet.Finish, dials as unknown as rivet.Dials),
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    blurb: 'Plate armour, a guarded walk, and a fully articulated sword slash.',
    canvasW: knight.CANVAS_W,
    canvasH: knight.CANVAS_H,
    themes: [
      { label: 'crimson', value: knight.CRIMSON },
      { label: 'azure', value: knight.AZURE },
    ],
    dials: [
      { key: 'stride', label: 'stride', min: 28, max: 76, sign: 1 },
      { key: 'swordArc', label: 'sword arc', min: 70, max: 120, sign: 1 },
    ],
    defaults: { ...knight.DEFAULT_DIALS },
    build: (theme, dials) =>
      knight.buildCharacter(theme as knight.Livery, dials as unknown as knight.Dials),
  },
  {
    id: 'husk',
    name: 'Husk',
    blurb: 'A hunched stack, both arms reaching, a limp, and a rag that hangs rather than streams.',
    canvasW: husk.CANVAS_W,
    canvasH: husk.CANVAS_H,
    themes: [
      { label: 'grave', value: husk.GRAVE },
      { label: 'drowned', value: husk.DROWNED },
    ],
    dials: [
      { key: 'stride', label: 'stride', min: 16, max: 80, sign: 1 },
      { key: 'drag', label: 'coat drag', min: 0, max: 2000, sign: -1 },
    ],
    defaults: { ...husk.DEFAULT_DIALS },
    build: (theme, dials) => husk.buildCharacter(theme as husk.Rot, dials as unknown as husk.Dials),
  },
];

let cast = CAST[0];
let themeIndex = 0;
let dials: Record<string, number> = { ...cast.defaults };
let character: CharacterSpec = cast.build(cast.themes[0].value, dials);
const baked = new Map<string, BakedClip & { bakeMs: number }>();
let current = [...character.clips.keys()][0];
const player = new ClipPlayer(getBaked(current));

let showBones = false;
let lastTick = 0;

function getBaked(name: string): BakedClip & { bakeMs: number } {
  const cached = baked.get(name);
  if (cached) return cached;
  const t0 = performance.now();
  const clip = bakeClip(character, name);
  const entry = { ...clip, bakeMs: performance.now() - t0 };
  baked.set(name, entry);
  return entry;
}

function rebuild(): void {
  character = cast.build(cast.themes[themeIndex].value, dials);
  baked.clear();
  player.set(getBaked(current));
  renderStrip();
  updateStatus();
}

// --- painting ---------------------------------------------------------------

function drawImg(ctx: CanvasRenderingContext2D, img: Img, scale: number): void {
  const off = new OffscreenCanvas(img.w, img.h);
  const octx = off.getContext('2d')!;
  octx.putImageData(new ImageData(img.toRGBA8(), img.w, img.h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, img.w * scale, img.h * scale);
}

function drawBones(ctx: CanvasRenderingContext2D): void {
  const clip = character.clips.get(current)!;
  const src = clip.mirrorOf !== '' ? character.clips.get(clip.mirrorOf)! : clip;
  const pose = src.poseAt(player.frame / src.bakeFps, character.skeleton);
  const xfs = character.skeleton.transforms(pose);
  const k = SCALE / (character.superSample ?? SS);
  const flip = clip.mirrorOf !== '';
  const fx = (x: number): number => (flip ? cast.canvasW * SCALE - x * k : x * k);
  ctx.strokeStyle = 'rgba(120, 255, 200, 0.9)';
  ctx.fillStyle = 'rgba(120, 255, 200, 0.9)';
  ctx.lineWidth = 1;
  for (const name of character.skeleton.names()) {
    const xf = xfs.get(name)!;
    const tipLen = character.skeleton.lengthOf(name);
    const tipX = xf.c * tipLen + xf.tx;
    const tipY = xf.d * tipLen + xf.ty;
    ctx.beginPath();
    ctx.moveTo(fx(xf.tx), xf.ty * k);
    ctx.lineTo(fx(tipX), tipY * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(fx(xf.tx), xf.ty * k, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderFrame(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const entry = getBaked(current);
  drawImg(ctx, entry.frames[player.frame], SCALE);
  if (showBones) drawBones(ctx);
  document.getElementById('counter')!.textContent =
    `${player.frame + 1} / ${entry.frames.length} @ ${entry.fps} fps`;
}

function renderStrip(): void {
  const entry = getBaked(current);
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  const s = 2;
  strip.width = entry.frames.length * (cast.canvasW * s + 2);
  strip.height = cast.canvasH * s;
  const ctx = strip.getContext('2d')!;
  ctx.clearRect(0, 0, strip.width, strip.height);
  entry.frames.forEach((f, i) => {
    ctx.save();
    ctx.translate(i * (cast.canvasW * s + 2), 0);
    drawImg(ctx, f, s);
    ctx.restore();
  });
}

function updateStatus(): void {
  const entry = getBaked(current);
  document.getElementById('status')!.textContent =
    `baked ${entry.frames.length} frames in ${entry.bakeMs.toFixed(0)} ms — ` +
    `deterministic, no model call, no repair`;
}

function runAudit(): void {
  const out = document.getElementById('audit')!;
  const t0 = performance.now();
  const reports = auditCharacter(character);
  const ms = performance.now() - t0;
  const failed = reports.reduce((n, r) => n + r.failed, 0);
  const lines = reports.map((r) =>
    r.failed === 0
      ? `ok    ${r.clip} (${r.frames} frames)`
      : r.checks
          .filter((c) => !c.ok)
          .map((c) => `FAIL  ${r.clip}: ${c.id}: ${c.text}`)
          .join('\n'),
  );
  out.textContent =
    `audit: ${failed === 0 ? 'all clean' : `${failed} check(s) FAILED`} in ${ms.toFixed(0)} ms\n` +
    lines.join('\n');
}

function tick(now: number): void {
  const prev = player.frame;
  player.advance((now - lastTick) / 1000);
  if (player.frame !== prev || !player.playing) renderFrame();
  lastTick = now;
  requestAnimationFrame(tick);
}

// --- controls ---------------------------------------------------------------

function selectClip(name: string): void {
  current = name;
  player.set(getBaked(name));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-clip]')) {
    b.classList.toggle('on', b.dataset.clip === name);
  }
  renderFrame();
  renderStrip();
  updateStatus();
}

/** The clip buttons come from the character, so a new clip in a source file
 * appears here with no page edit. */
function buildClipButtons(): void {
  const row = document.getElementById('clips')!;
  row.textContent = '';
  for (const name of character.clips.keys()) {
    const b = document.createElement('button');
    b.dataset.clip = name;
    b.textContent = name.replace(/_/g, ' ');
    b.addEventListener('click', () => selectClip(name));
    row.append(b);
  }
}

/** The same for the dials: each cast member names its own. */
function buildDialSliders(): void {
  const row = document.getElementById('dials')!;
  row.textContent = '';
  for (const spec of cast.dials) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const out = document.createElement('span');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.value = String(Math.abs(dials[spec.key]));
    out.textContent = input.value;
    input.addEventListener('change', () => {
      dials[spec.key] = Number(input.value) * spec.sign;
      out.textContent = input.value;
      rebuild();
      renderFrame();
    });
    label.append(`${spec.label} `, input, ' ', out);
    row.append(label);
  }
}

function selectCharacter(member: CastMember): void {
  cast = member;
  themeIndex = 0;
  dials = { ...member.defaults };
  baked.clear();
  character = member.build(member.themes[0].value, dials);
  current = [...character.clips.keys()][0];
  const stage = document.getElementById('stage') as HTMLCanvasElement;
  stage.width = member.canvasW * SCALE;
  stage.height = member.canvasH * SCALE;
  document.getElementById('blurb')!.textContent = member.blurb;
  document.getElementById('theme')!.textContent = `Theme: ${member.themes[0].label}`;
  document.getElementById('audit')!.textContent = '';
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cast]')) {
    b.classList.toggle('on', b.dataset.cast === member.id);
  }
  buildClipButtons();
  buildDialSliders();
  player.set(getBaked(current));
  selectClip(current);
}

function wire(): void {
  const row = document.getElementById('cast')!;
  for (const member of CAST) {
    const b = document.createElement('button');
    b.dataset.cast = member.id;
    b.textContent = member.name;
    b.addEventListener('click', () => selectCharacter(member));
    row.append(b);
  }
  const playBtn = document.getElementById('play')!;
  playBtn.addEventListener('click', () => {
    player.playing = !player.playing;
    playBtn.textContent = player.playing ? 'Pause' : 'Play';
  });
  const bonesBox = document.getElementById('bones') as HTMLInputElement;
  bonesBox.addEventListener('change', () => {
    showBones = bonesBox.checked;
    renderFrame();
  });
  const themeBtn = document.getElementById('theme')!;
  themeBtn.addEventListener('click', () => {
    themeIndex = (themeIndex + 1) % cast.themes.length;
    themeBtn.textContent = `Theme: ${cast.themes[themeIndex].label}`;
    rebuild();
    renderFrame();
  });
  document.getElementById('run-audit')!.addEventListener('click', runAudit);
}

function start(): void {
  wire();
  selectCharacter(CAST[0]);
  lastTick = performance.now();
  requestAnimationFrame(tick);
}

start();
