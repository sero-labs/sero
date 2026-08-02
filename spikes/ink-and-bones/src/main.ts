/**
 * The POC page: bake the puppet's clips in the browser, play them on a
 * pixel-scaled canvas, and expose the dials that prove the point — a stride,
 * a wind, a whole theme — each a one-line change followed by a deterministic
 * rebake. No video model, no repair pass.
 */

import type { Character, Dials, Theme } from './character';
import {
  CANVAS_H,
  CANVAS_W,
  DEFAULT_DIALS,
  DUSK,
  EMBER,
  buildCharacter,
} from './character';
import { SS, bake } from './compositor';
import type { Img } from './img';

const SCALE = 5;

interface Baked {
  frames: Img[];
  fps: number;
  bakeMs: number;
}

let character: Character = buildCharacter();
let theme: Theme = DUSK;
let dials: Dials = { ...DEFAULT_DIALS };
const baked = new Map<string, Baked>();

let current = 'run';
let playing = true;
let frame = 0;
let showBones = false;
let lastTick = 0;
let accum = 0;

function bakeClip(name: string): Baked {
  const cached = baked.get(name);
  if (cached) return cached;
  const clip = character.clips.get(name)!;
  if (clip.mirrorOf !== '') {
    const src = bakeClip(clip.mirrorOf);
    const entry: Baked = {
      frames: src.frames.map((f) => f.flippedX()),
      fps: src.fps,
      bakeMs: src.bakeMs,
    };
    baked.set(name, entry);
    return entry;
  }
  const t0 = performance.now();
  const frames = bake(
    character.skeleton,
    character.parts,
    clip,
    CANVAS_W,
    CANVAS_H,
    character.cfg,
    character.shadow,
  );
  const entry: Baked = { frames, fps: clip.bakeFps, bakeMs: performance.now() - t0 };
  baked.set(name, entry);
  return entry;
}

function rebuild(): void {
  character = buildCharacter(theme, dials);
  baked.clear();
  frame = 0;
  renderStrip();
  updateStatus();
}

// --- painting ---------------------------------------------------------------

function drawImg(ctx: CanvasRenderingContext2D, img: Img, scale: number): void {
  const off = new OffscreenCanvas(img.w, img.h);
  const octx = off.getContext('2d')!;
  const data = octx.createImageData(img.w, img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    data.data[i * 4] = Math.round(img.data[i * 4] * 255);
    data.data[i * 4 + 1] = Math.round(img.data[i * 4 + 1] * 255);
    data.data[i * 4 + 2] = Math.round(img.data[i * 4 + 2] * 255);
    data.data[i * 4 + 3] = Math.round(img.data[i * 4 + 3] * 255);
  }
  octx.putImageData(data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, img.w * scale, img.h * scale);
}

function drawBones(ctx: CanvasRenderingContext2D): void {
  const clip = character.clips.get(current)!;
  const src = clip.mirrorOf !== '' ? character.clips.get(clip.mirrorOf)! : clip;
  const pose = src.poseAt(frame / src.bakeFps, character.skeleton);
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
    const tipX = xf.a * 0 + xf.c * tipLen + xf.tx;
    const tipY = xf.b * 0 + xf.d * tipLen + xf.ty;
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
  const entry = bakeClip(current);
  drawImg(ctx, entry.frames[frame % entry.frames.length], SCALE);
  if (showBones) drawBones(ctx);
  const counter = document.getElementById('counter')!;
  counter.textContent = `${(frame % entry.frames.length) + 1} / ${entry.frames.length} @ ${entry.fps} fps`;
}

function renderStrip(): void {
  const entry = bakeClip(current);
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
  const entry = bakeClip(current);
  document.getElementById('status')!.textContent =
    `baked ${entry.frames.length} frames in ${entry.bakeMs.toFixed(0)} ms — ` +
    `deterministic, no model call, no repair`;
}

function tick(now: number): void {
  const entry = bakeClip(current);
  if (playing) {
    accum += (now - lastTick) / 1000;
    const spf = 1 / entry.fps;
    while (accum >= spf) {
      accum -= spf;
      frame = (frame + 1) % entry.frames.length;
    }
    renderFrame();
  }
  lastTick = now;
  requestAnimationFrame(tick);
}

// --- controls ---------------------------------------------------------------

function selectClip(name: string): void {
  current = name;
  frame = 0;
  accum = 0;
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
    playing = !playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
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
