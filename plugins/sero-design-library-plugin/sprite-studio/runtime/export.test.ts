import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { designLibraryPathsFromHome, type DesignLibraryPaths } from '../../shared/paths';
import type { Atlas } from '../engine/atlas';
import { TRANSPARENT, type CellGrid, type LoopMode, type Palette } from '../engine/types';
import type { AnimationRecord, CharacterRecord, FrameRecord } from '../shared/character';
import { exportDir, frameFile } from '../shared/paths';
import { exportCharacter, type SpriteExportRequestOptions } from './export';
import { encodeIndexedPng } from './png';
import { paletteOf, writeAnimation, writeCharacter, writeFrame } from './store';

const PALETTE = ['#3f6b34', '#e3b58c', '#231a12', '#c8102e'];
/** The palette entry the anchor cell is painted with, so a test can find it. */
const MARKER = 3;

interface AnimationSpec {
  id: string;
  loop: LoopMode;
  playRate: number;
  cols: number;
  rows: number;
  anchor: { col: number; row: number };
  /** The real time each frame held. Deliberately not a multiple of the rate. */
  durations: number[];
}

const IDLE: AnimationSpec = {
  id: 'idle',
  loop: 'pingpong',
  playRate: 12,
  cols: 6,
  rows: 8,
  anchor: { col: 3, row: 7 },
  durations: [66, 83],
};

const ATTACK: AnimationSpec = {
  id: 'attack',
  loop: 'once',
  playRate: 15,
  cols: 9,
  rows: 10,
  anchor: { col: 4, row: 9 },
  durations: [41, 50, 58],
};

let home: string;
let workspace: string;
let assets: string;
let paths: DesignLibraryPaths;
let palette: Palette;
/** Each frame's cells, keyed the way the atlas names them. */
const grids = new Map<string, CellGrid>();

function grid(spec: AnimationSpec, index: number): CellGrid {
  const cells = new Int16Array(spec.cols * spec.rows);
  for (let y = 0; y < spec.rows; y++) {
    for (let x = 0; x < spec.cols; x++) {
      cells[y * spec.cols + x] = ((x * 3 + y * 5 + index * 7) % 5) - 1;
    }
  }
  cells[spec.anchor.row * spec.cols + spec.anchor.col] = MARKER;
  return { cols: spec.cols, rows: spec.rows, cells };
}

function characterRecord(): CharacterRecord {
  return {
    id: 'explorer',
    name: 'Explorer',
    source: 'reference',
    status: 'approved',
    palette: PALETTE,
    cap: { kind: 'measured' },
    ramps: [],
    artHeight: 8,
    artWidth: 6,
    exportScale: 1,
    basePoseFile: 'characters/explorer/base-pose.png',
    root: { footRow: 7, centreCol: 3 },
    styleNotes: 'A green coat and a brown hat.',
    ingestion: {
      block: 1,
      lift: 4,
      sourceWidth: 6,
      sourceHeight: 8,
      measuredColours: 4,
      residual: 0,
      backgroundRemoved: true,
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

async function seed(): Promise<void> {
  const character = characterRecord();
  await writeCharacter(paths, character);
  for (const spec of [IDLE, ATTACK]) {
    const frames: FrameRecord[] = [];
    for (const [index, durationMs] of spec.durations.entries()) {
      const cells = grid(spec, index);
      grids.set(`${spec.id} ${index}`, cells);
      const id = `${spec.id}-${index}`;
      frames.push({
        id,
        file: await writeFrame(paths, character, spec.id, id, cells),
        root: { x: spec.anchor.col, y: spec.anchor.row },
        grounded: true,
        durationMs,
        provenance: { model: 'test', kind: 'video', repairs: 0, createdAt: 1 },
        findings: [],
      });
    }
    const animation: AnimationRecord = {
      id: spec.id,
      characterId: character.id,
      plan: {
        name: spec.id,
        instruction: 'move',
        frameCount: frames.length,
        playRate: spec.playRate,
        loop: spec.loop,
      },
      status: 'approved',
      canvas: { cols: spec.cols, rows: spec.rows },
      anchor: spec.anchor,
      frames,
      findings: [],
      report: null,
      history: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await writeAnimation(paths, animation);
  }
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'sprite-export-'));
  workspace = path.join(home, 'workspace');
  assets = path.join(workspace, 'assets', 'sprites');
  await mkdir(workspace, { recursive: true });
  paths = designLibraryPathsFromHome(path.join(home, 'app'));
  palette = paletteOf(characterRecord());
  grids.clear();
  await seed();
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function runExport(
  overrides: Partial<SpriteExportRequestOptions> = {},
  exportId = 'exp-1',
): Promise<{ sheet: PNG; atlas: Atlas; bytes: Buffer; result: Awaited<ReturnType<typeof exportCharacter>> }> {
  const result = await exportCharacter(
    paths,
    {
      exportId,
      characterId: 'explorer',
      animationIds: ['idle', 'attack'],
      options: {
        scale: 1,
        layout: 'rows',
        uniformCell: false,
        trim: false,
        destination: { kind: 'workspace', path: assets },
        ...overrides,
      },
    },
    { workspacePath: workspace },
  );
  const bytes = await readFile(result.sheetFile);
  return {
    result,
    bytes,
    // Read back by a library that had nothing to do with writing it.
    sheet: PNG.sync.read(bytes),
    atlas: JSON.parse(await readFile(result.atlasFile, 'utf8')) as Atlas,
  };
}

/**
 * The palette index one sheet pixel holds, as an independent reader sees it.
 *
 * `-2` can never be a cell, so a colour the character does not own fails a
 * comparison instead of reading as transparent.
 */
function indexAt(sheet: PNG, x: number, y: number): number {
  const offset = (y * sheet.width + x) * 4;
  if (sheet.data[offset + 3] === 0) return TRANSPARENT;
  const found = palette.findIndex(
    (entry) =>
      entry[0] === sheet.data[offset] &&
      entry[1] === sheet.data[offset + 1] &&
      entry[2] === sheet.data[offset + 2],
  );
  return found < 0 ? -2 : found;
}

/** Every pixel the atlas claims for a frame, against that frame's own cells. */
function rectangleFaults(atlas: Atlas, sheet: PNG, scale: number): string[] {
  const faults: string[] = [];
  for (const frame of atlas.frames) {
    const cells = grids.get(frame.filename);
    if (cells === undefined) {
      faults.push(`${frame.filename} is not a frame that was exported`);
      continue;
    }
    for (let y = 0; y < frame.frame.h; y++) {
      for (let x = 0; x < frame.frame.w; x++) {
        const sourceX = Math.floor(x / scale);
        const sourceY = Math.floor(y / scale);
        const expected =
          sourceX < cells.cols && sourceY < cells.rows
            ? cells.cells[sourceY * cells.cols + sourceX] ?? TRANSPARENT
            : TRANSPARENT;
        const actual = indexAt(sheet, frame.frame.x + x, frame.frame.y + y);
        if (actual !== expected) {
          faults.push(`${frame.filename} at ${x},${y}: ${actual} rather than ${expected}`);
        }
      }
    }
  }
  return faults;
}

describe('sprite export', () => {
  it('writes one sheet and one atlas, and the sheet is a real indexed PNG', async () => {
    const { result, atlas, bytes, sheet } = await runExport();

    expect((await readdir(assets)).toSorted()).toEqual(['explorer.json', 'explorer.png']);
    expect((await readdir(exportDir(paths, 'explorer', 'exp-1'))).toSorted()).toEqual([
      'explorer.json',
      'explorer.png',
    ]);
    expect(result.frames).toBe(5);
    expect(atlas.meta.image).toBe('explorer.png');
    expect(atlas.meta.sero.character).toBe('explorer');
    expect(atlas.meta.sero.palette).toEqual(PALETTE);

    // The IHDR data starts at byte 16; its tenth byte is the colour type, and 3
    // is indexed. RGBA could hold a colour the character does not have (D2).
    expect(bytes[25]).toBe(3);
    const used = new Set<string>();
    let transparent = 0;
    for (let i = 0; i < sheet.width * sheet.height; i++) {
      if (sheet.data[i * 4 + 3] === 0) transparent++;
      else used.add(`${sheet.data[i * 4]},${sheet.data[i * 4 + 1]},${sheet.data[i * 4 + 2]}`);
    }
    expect([...used].toSorted()).toEqual(palette.map((entry) => entry.join(',')).toSorted());
    expect(transparent).toBeGreaterThan(0);
  });

  it('lays the frames where the atlas says they are', async () => {
    const { atlas, sheet, result } = await runExport({ scale: 3 });

    expect(result.scale).toBe(3);
    expect(sheet.width).toBe(result.width);
    expect(sheet.height).toBe(result.height);
    expect(atlas.meta.size).toEqual({ w: sheet.width, h: sheet.height });
    expect(rectangleFaults(atlas, sheet, 3)).toEqual([]);
  });

  it('carries the frames own durations, not a rate chosen afterwards', async () => {
    const { atlas } = await runExport();

    expect(atlas.frames.map((frame) => frame.duration)).toEqual([66, 83, 41, 50, 58]);
  });

  it('exports the frames a ping-pong animation holds, and names the one-shot', async () => {
    const { atlas } = await runExport();

    // The return leg is `direction`, not more pixels: two frames stay two.
    expect(atlas.meta.frameTags).toEqual([
      { name: 'idle', from: 0, to: 1, direction: 'pingpong' },
      { name: 'attack', from: 2, to: 4, direction: 'forward' },
    ]);
    expect(atlas.frames).toHaveLength(5);
    expect(atlas.meta.sero.once).toEqual(['attack']);
  });

  it('pads every animation to the largest canvas and keeps each anchor on the character', async () => {
    const { atlas, sheet } = await runExport({ uniformCell: true, scale: 2 });

    expect(atlas.frames.map((frame) => `${frame.frame.w}x${frame.frame.h}`)).toEqual(
      Array.from({ length: 5 }, () => `${ATTACK.cols * 2}x${ATTACK.rows * 2}`),
    );
    // The padding is empty and the frames still sit where the atlas says.
    expect(rectangleFaults(atlas, sheet, 2)).toEqual([]);

    for (const tag of atlas.meta.frameTags) {
      const anchor = atlas.meta.sero.anchors.find((entry) => entry.animation === tag.name);
      const frame = atlas.frames[tag.from];
      expect(anchor).toBeDefined();
      expect(frame).toBeDefined();
      if (anchor === undefined || frame === undefined) continue;
      expect(indexAt(sheet, frame.frame.x + anchor.x, frame.frame.y + anchor.y)).toBe(MARKER);
    }
  });

  it('resolves a requested height to a whole scale and reports the real height', async () => {
    // 30 px from an 8 px character is 3.75×, which would blur every pixel (D3).
    const { result, atlas, sheet } = await runExport({ height: 30 });

    expect(result.scale).toBe(4);
    expect(result.spriteHeight).toBe(32);
    expect(atlas.meta.scale).toBe('4');
    expect(sheet.height).toBe((IDLE.rows + ATTACK.rows) * 4);
  });

  it('refuses a frame whose palette was edited elsewhere', async () => {
    const cells = grid(IDLE, 0);
    const shifted = palette.map(([r, g, b]) => [r, g, (b + 1) % 256] as const);
    await writeFile(
      frameFile(paths, 'explorer', 'idle', 'idle-0'),
      encodeIndexedPng(cells.cells, cells.cols, cells.rows, shifted),
    );

    await expect(runExport()).rejects.toThrow(/different palette/);
  });

  it('refuses a folder outside the open workspace', async () => {
    await expect(
      runExport({ destination: { kind: 'workspace', path: path.join(workspace, '..', 'escape') } }),
    ).rejects.toThrow(/outside the active workspace/);
  });
});
