/**
 * The example page: bake Scout's clips in the browser, play them on a
 * pixel-scaled canvas, and expose the dials that prove the point — a stride,
 * a wind, a whole theme — each a one-line change followed by a deterministic
 * rebake. This file is also the package's consumer smoke test: it only uses
 * the public API (plus the skeleton overlay's read access).
 */

import type { BakedClip, CharacterSpec, Img } from '../src/index';
import { ClipPlayer, SS, auditCharacter, bakeClip } from '../src/index';
import type { Dials, Theme } from './scout';
import { CANVAS_H, CANVAS_W, DEFAULT_DIALS, DUSK, EMBER, buildCharacter } from './scout';

const SCALE = 5;

let character: CharacterSpec = buildCharacter();
let theme: Theme = DUSK;
let dials: Dials = { ...DEFAULT_DIALS };
const baked = new Map<string, BakedClip & { bakeMs: number }>();
const player = new ClipPlayer(getBaked('run'));

let current = 'run';
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
  character = buildCharacter(theme, dials);
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
  const k = SCALE / SS;
  const flip = clip.mirrorOf !== '';
  const fx = (x: number): number => (flip ? CANVAS_W * SCALE - x * k : x * k);
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
  const counter = document.getElementById('counter')!;
  counter.textContent = `${player.frame + 1} / ${entry.frames.length} @ ${entry.fps} fps`;
}

function renderStrip(): void {
  const entry = getBaked(current);
  const strip = document.getElementById('strip') as HTMLCanvasElement;
  const s = 2;
  strip.width = entry.frames.length * (CANVAS_W * s + 2);
  strip.height = CANVAS_H * s;
  const ctx = strip.getContext('2d')!;
  ctx.clearRect(0, 0, strip.width, strip.height);
  entry.frames.forEach((f, i) => {
    ctx.save();
    ctx.translate(i * (CANVAS_W * s + 2), 0);
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

function wire(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-clip]')) {
    b.addEventListener('click', () => selectClip(b.dataset.clip!));
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
  const stride = document.getElementById('stride') as HTMLInputElement;
  stride.addEventListener('change', () => {
    dials.stride = Number(stride.value);
    document.getElementById('stride-out')!.textContent = stride.value;
    rebuild();
    renderFrame();
  });
  const wind = document.getElementById('wind') as HTMLInputElement;
  wind.addEventListener('change', () => {
    dials.runWind = -Number(wind.value);
    document.getElementById('wind-out')!.textContent = wind.value;
    rebuild();
    renderFrame();
  });
  const themeBtn = document.getElementById('theme')!;
  themeBtn.addEventListener('click', () => {
    theme = theme === DUSK ? EMBER : DUSK;
    themeBtn.textContent = theme === DUSK ? 'Theme: dusk' : 'Theme: ember';
    rebuild();
    renderFrame();
  });
  document.getElementById('run-audit')!.addEventListener('click', runAudit);
}

function start(): void {
  const stage = document.getElementById('stage') as HTMLCanvasElement;
  stage.width = CANVAS_W * SCALE;
  stage.height = CANVAS_H * SCALE;
  wire();
  selectClip(current);
  lastTick = performance.now();
  requestAnimationFrame(tick);
}

start();
