/**
 * One fixture per fault class, each built to fail exactly that check (plan §8).
 * Every fixture is readable as a picture: a tile that does not wrap looks wrong
 * in the source of the test that says so.
 */

import { describe, expect, it } from 'vitest';

import { drawnProject, knightProject } from '../testing/fixtures';
import { validateKind } from './kinds';
import { validateProject } from './index';

/** Edges agree in both directions: the left column is the right, the top the bottom. */
const WRAPPING_TILE = [
  '32232323',
  '22322232',
  '32223223',
  '22322322',
  '32232233',
  '22322232',
  '32223223',
  '32232323',
];

describe('tiles', () => {
  it('pass when both edges wrap', () => {
    expect(validateKind(drawnProject('tile', WRAPPING_TILE))).toEqual([]);
  });

  it('are caught when the left column does not meet the right', () => {
    const rows = WRAPPING_TILE.map((row, y) => (y === 3 ? `${row.slice(0, 7)}3` : row));
    const faults = validateKind(drawnProject('tile', rows));
    expect(faults.map((fault) => fault.code)).toContain('tile-edge-columns');
    expect(faults[0].message).toContain('row 3');
  });

  it('are caught when the top row does not meet the bottom', () => {
    const rows = [...WRAPPING_TILE.slice(0, 7), '22222222'];
    expect(validateKind(drawnProject('tile', rows)).map((fault) => fault.code)).toContain('tile-edge-rows');
  });

  it('are not checked for a character, which never has to wrap', () => {
    expect(validateKind(knightProject())).toEqual([]);
  });
});

describe('items', () => {
  const coin = [
    '00111100',
    '01122110',
    '11233211',
    '12332321',
    '12332321',
    '11233211',
    '01122110',
    '00111100',
  ];

  it('pass when the icon fills the canvas and carries an outline', () => {
    expect(validateKind(drawnProject('item', coin))).toEqual([]);
  });

  it('are caught when the icon is too small to read', () => {
    const speck = ['00000000', '00000000', '00011000', '00011000', '00000000', '00000000', '00000000', '00000000'];
    const faults = validateKind(drawnProject('item', speck));
    expect(faults.map((fault) => fault.code)).toContain('item-fill');
    expect(faults[0].message).toMatch(/reads as a speck/);
  });

  it('report a gap in the outline without blocking the compile', () => {
    const gapped = coin.map((row, y) => (y === 3 ? `2${row.slice(1)}` : row));
    const faults = validateKind(drawnProject('item', gapped));
    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe('item-outline-gap');
    expect(faults[0].severity).toBe('warning');
  });

  it('call an icon with no outline at all a different fault', () => {
    const bare = coin.map((row) => row.replace(/1/g, '2'));
    expect(validateKind(drawnProject('item', bare)).map((fault) => fault.code)).toContain('item-no-outline');
  });
});

describe('the firewall', () => {
  it('reports a structural fault on its own, because nothing can be resolved past it', () => {
    const project = knightProject();
    project.canvas = { width: 12.5, height: 16 };
    const { faults, ok } = validateProject(project);
    expect(ok).toBe(false);
    expect(faults.every((fault) => fault.code === 'canvas-size')).toBe(true);
  });

  it('passes a project that is right in every family', () => {
    expect(validateProject(knightProject())).toEqual({ faults: [], ok: true });
  });

  it('still compiles a project whose only faults are warnings', () => {
    const project = knightProject();
    project.palette.colours.push({ hex: '#ff00ff', name: 'unused pink' });
    const { faults, ok } = validateProject(project);
    expect(ok).toBe(true);
    expect(faults.map((fault) => fault.code)).toEqual(['palette-unused']);
  });
});
