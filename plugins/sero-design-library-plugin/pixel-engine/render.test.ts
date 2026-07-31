import { describe, expect, it } from 'vitest';

import { compileProject } from './compile';
import { sha256Hex } from './hash';
import { packSheet } from './pack';
import { encodePng } from './png';
import { paletteBytes, parseHex, renderFrame, renderGrid } from './render';
import { resolveFrame } from './resolve';
import { ENGINE_VERSION } from './schema';
import { drawnProject, knightProject } from './testing/fixtures';

const TWO_BY_TWO = [
  [0, 1],
  [2, 0],
];

describe('rendering', () => {
  it('turns each cell into one pixel at 1×', () => {
    const project = knightProject();
    const image = renderGrid(TWO_BY_TWO, project.palette);
    expect([image.width, image.height]).toEqual([2, 2]);
    // Index 0 is transparent whatever colour the palette gives it.
    expect([...image.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...image.data.slice(4, 8)]).toEqual([0x1a, 0x1a, 0x24, 0xff]);
  });

  it('repeats each cell exactly `scale` times, with no blending', () => {
    const image = renderGrid(TWO_BY_TWO, knightProject().palette, { scale: 4 });
    expect([image.width, image.height]).toEqual([8, 8]);
    const colours = new Set<string>();
    for (let at = 0; at < image.data.length; at += 4) colours.add([...image.data.slice(at, at + 4)].join());
    // Three colours in, three colours out: a filter would have invented more.
    expect(colours.size).toBe(3);
  });

  it('refuses a fractional scale rather than rounding it', () => {
    expect(() => renderGrid(TWO_BY_TWO, knightProject().palette, { scale: 1.5 })).toThrow(/never stretched/);
    expect(() => renderGrid(TWO_BY_TWO, knightProject().palette, { scale: 0 })).toThrow();
  });

  it('renders a frame through the same resolution the compiler uses', () => {
    const project = knightProject();
    const direct = renderGrid(resolveFrame(project, project.frames[0]), project.palette, { scale: 2 });
    expect(renderFrame(project, project.frames[0], { scale: 2 }).data).toEqual(direct.data);
  });

  it('reads a palette as bytes, with index 0 always clear', () => {
    expect(paletteBytes(knightProject().palette)[0]).toEqual([0, 0, 0, 0]);
    expect(parseHex('#3f76a8')).toEqual([0x3f, 0x76, 0xa8, 0xff]);
    expect(() => parseHex('#fff')).toThrow();
  });
});

describe('packing', () => {
  const frames = [
    [
      [1, 2],
      [3, 4],
    ],
    [
      [5, 0],
      [0, 5],
    ],
  ];

  it('lays one row per clip with no border around the sheet', () => {
    const packed = packSheet([{ name: 'walk', frames }]);
    expect([packed.width, packed.height]).toEqual([4, 2]);
    expect(packed.frames).toEqual([
      { rowIndex: 0, row: 'walk', index: 0, x: 0, y: 0, width: 2, height: 2 },
      { rowIndex: 0, row: 'walk', index: 1, x: 2, y: 0, width: 2, height: 2 },
    ]);
  });

  it('puts transparent padding between frames', () => {
    const packed = packSheet([{ name: 'walk', frames }], { padding: 1 });
    expect(packed.width).toBe(5);
    expect(packed.grid[0]).toEqual([1, 2, 0, 5, 0]);
  });

  it('repeats the edge cells outwards, so a sampler cannot read a neighbour', () => {
    const packed = packSheet([{ name: 'walk', frames }], { extrude: 1 });
    // Each cell grows a one-cell ring: the corner repeats the corner.
    expect([packed.width, packed.height]).toEqual([8, 4]);
    expect(packed.grid[0].slice(0, 4)).toEqual([1, 1, 2, 2]);
    expect(packed.grid[1].slice(0, 4)).toEqual([1, 1, 2, 2]);
    expect(packed.grid[3].slice(0, 4)).toEqual([3, 3, 4, 4]);
  });

  it('stacks a row per clip', () => {
    const packed = packSheet([
      { name: 'idle', frames: [frames[0]] },
      { name: 'walk', frames },
    ]);
    expect([packed.width, packed.height]).toEqual([4, 4]);
    expect(packed.frames.map((frame) => `${frame.row}:${frame.x},${frame.y}`)).toEqual(['idle:0,0', 'walk:0,2', 'walk:2,2']);
  });

  it('refuses a fractional padding', () => {
    expect(() => packSheet([{ name: 'walk', frames }], { padding: 0.5 })).toThrow();
  });
});

describe('the atlas', () => {
  it('describes every packed frame, tags the clips and records the pivot', () => {
    const { atlas, packed } = compileProject(knightProject(), { image: 'sheet.png' });
    expect(atlas.frames).toHaveLength(packed.frames.length);
    expect(atlas.meta.size).toEqual({ w: packed.width, h: packed.height });
    expect(atlas.meta.frameTags).toEqual([
      { name: 'base', from: 0, to: 0, direction: 'forward' },
      { name: 'Walk', from: 1, to: 4, direction: 'forward' },
    ]);
    expect(atlas.meta.slices[0].keys[0].pivot).toEqual({ x: 6, y: 15 });
    expect(atlas.frames[1].duration).toBe(120);
  });

  it('scales every rectangle with the sheet it describes', () => {
    const { atlas } = compileProject(knightProject(), { scale: 3 });
    expect(atlas.meta.scale).toBe('3');
    expect(atlas.frames[0].frame).toEqual({ x: 0, y: 0, w: 36, h: 48 });
    expect(atlas.meta.slices[0].keys[0].pivot).toEqual({ x: 18, y: 45 });
  });

  it('marks a ping-pong clip as one', () => {
    const project = knightProject();
    project.clips[0].loop = 'ping-pong';
    expect(compileProject(project).atlas.meta.frameTags[1].direction).toBe('pingpong');
  });

  it('keeps two clips of the same name apart, because only ids are unique', () => {
    const project = knightProject();
    const slow = { ...project.clips[0], id: 'walk-slow', frames: project.clips[0].frames.map((frame) => ({ ...frame, durationMs: 400 })) };
    project.clips.push(slow);
    const { atlas } = compileProject(project);
    expect(atlas.frames.filter((frame) => frame.duration === 120)).toHaveLength(4);
    expect(atlas.frames.filter((frame) => frame.duration === 400)).toHaveLength(4);
  });

  it('is not confused by a clip a user named "base"', () => {
    const project = knightProject();
    project.clips[0].name = 'base';
    project.clips[0].frames = project.clips[0].frames.map((frame) => ({ ...frame, durationMs: 777 }));
    const { atlas } = compileProject(project);
    // The unclipped base pose keeps its own duration; the clip keeps its own.
    expect(atlas.frames.map((frame) => frame.duration)).toEqual([100, 777, 777, 777, 777]);
  });

  it('records the version of the engine that compiled it, not the one the project claims', () => {
    const project = knightProject();
    project.engineVersion = '0.0.1-from-last-year';
    const { atlas, engineVersion } = compileProject(project);
    expect(atlas.meta.version).toBe(ENGINE_VERSION);
    expect(engineVersion).toBe(ENGINE_VERSION);
  });

  it('refuses to compile a project with nothing drawn in it', () => {
    const project = knightProject();
    project.frames = [];
    project.clips = [];
    expect(() => compileProject(project)).toThrow(/no frames to compile/);
  });
});

describe('PNG encoding', () => {
  it('writes a signature, the size, and nothing platform-dependent', () => {
    const png = encodePng(renderGrid(TWO_BY_TWO, knightProject().palette));
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect([...png.slice(12, 16)]).toEqual([...'IHDR'].map((char) => char.charCodeAt(0)));
    expect([...png.slice(16, 24)]).toEqual([0, 0, 0, 2, 0, 0, 0, 2]);
    // Colour type 6, eight bits per channel, no interlace.
    expect([...png.slice(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  });

  it('gives the same bytes for the same pixels, every time', () => {
    const image = renderGrid(TWO_BY_TWO, knightProject().palette, { scale: 5 });
    expect(sha256Hex(encodePng(image))).toBe(sha256Hex(encodePng(image)));
  });

  it('encodes an empty sprite without falling over', () => {
    expect(encodePng(renderGrid([[0]], drawnProject('item', ['0']).palette)).length).toBeGreaterThan(0);
  });
});
