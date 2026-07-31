/**
 * One fixture per fault class, each built to fail exactly that check (plan §8).
 */

import { describe, expect, it } from 'vitest';

import { hasErrors } from '../fault';
import { blankGrid } from '../grid';
import { resolveFrame } from '../resolve';
import type { PixelProject } from '../schema';
import { knightProject } from '../testing/fixtures';
import { checkLockViolations, validateSemantics } from './semantic';

function codes(project: PixelProject): string[] {
  return validateSemantics(project).map((fault) => fault.code);
}

function broken(mutate: (project: PixelProject) => void): PixelProject {
  const project = knightProject();
  mutate(project);
  return project;
}

it('passes a well-formed project with no faults at all', () => {
  expect(validateSemantics(knightProject())).toEqual([]);
});

describe('lock violations', () => {
  it('name the cell a proposal tried to overwrite', () => {
    const project = knightProject();
    const frame = { ...project.frames[0], locks: [{ x: 4, y: 7, index: 2 }] };
    const proposal = resolveFrame(project, project.frames[0]);
    const faults = checkLockViolations(project, frame, proposal);
    expect(faults).toHaveLength(1);
    expect(faults[0].code).toBe('lock-violation');
    expect(faults[0].where).toEqual({ frameId: 'base', x: 4, y: 7, index: 2 });
  });

  it('pass a proposal that left the locked cell alone', () => {
    const project = knightProject();
    const proposal = resolveFrame(project, project.frames[0]);
    const frame = { ...project.frames[0], locks: [{ x: 4, y: 7, index: proposal[7][4] }] };
    expect(checkLockViolations(project, frame, proposal)).toEqual([]);
  });

  it('catch a proposal that erased the whole grid', () => {
    const project = knightProject();
    const frame = { ...project.frames[0], locks: [{ x: 4, y: 7, index: 4 }] };
    expect(checkLockViolations(project, frame, blankGrid(12, 16))).toHaveLength(1);
  });
});

describe('drift', () => {
  it('is caught when a frame moves further than the clip declared', () => {
    const faults = validateSemantics(
      broken((project) => {
        project.clips[0].motionBudgetPx = 0;
        project.frames[1].placements = project.frames[1].placements.map((placement) => ({ ...placement, dx: placement.dx + 4 }));
      }),
    );
    expect(faults.some((fault) => fault.code === 'drift')).toBe(true);
    expect(faults.find((fault) => fault.code === 'drift')?.message).toMatch(/motion budget/);
  });

  it('measures the seam where a loop runs back into its first frame', () => {
    // Three frames sliding a pixel at a time: every step is inside the budget and
    // only the wrap from the last frame back to the first breaks it.
    const faults = validateSemantics(
      broken((project) => {
        project.clips[0].motionBudgetPx = 1;
        project.clips[0].frames = project.clips[0].frames.slice(0, 3);
        [1, 2, 3].forEach((frameIndex, step) => {
          project.frames[frameIndex].placements = project.frames[frameIndex].placements.map((placement) => ({ ...placement, dy: step }));
        });
      }),
    );
    expect(faults.filter((fault) => fault.code === 'drift')).toHaveLength(1);
  });

  it('stays quiet when the movement is within the budget', () => {
    expect(codes(broken((project) => (project.clips[0].motionBudgetPx = 3)))).toEqual([]);
  });
});

describe('part integrity', () => {
  it('catches a patch repainting a part instead of declaring a variant', () => {
    const faults = validateSemantics(broken((project) => project.frames[1].patch.push({ x: 4, y: 7, index: 5 })));
    expect(faults.some((fault) => fault.code === 'part-integrity')).toBe(true);
    expect(faults.find((fault) => fault.code === 'part-integrity')?.message).toMatch(/declare a variant/);
  });

  it('allows the same change when the user made it by hand', () => {
    expect(codes(broken((project) => project.frames[1].locks.push({ x: 4, y: 7, index: 5 })))).toEqual([]);
  });

  it('allows a variant, which is the supported way to redraw a part', () => {
    expect(
      codes(
        broken((project) => {
          const legL = project.parts[2];
          legL.variants.push({ id: 'stride', rows: legL.rows.map((row) => row.replace('3', '4')) });
          project.frames[1].placements = project.frames[1].placements.map((placement) =>
            placement.partId === 'legL' ? { ...placement, variantId: 'stride' } : placement,
          );
        }),
      ),
    ).toEqual([]);
  });

  it('ignores a patch that lands where no part drew anything', () => {
    expect(codes(broken((project) => project.frames[0].patch.push({ x: 1, y: 8, index: 1 })))).not.toContain('part-integrity');
  });
});

describe('orphan cells', () => {
  it('are reported one by one, with a coordinate', () => {
    const faults = validateSemantics(broken((project) => project.frames[0].patch.push({ x: 0, y: 0, index: 1 })));
    const orphan = faults.find((fault) => fault.code === 'orphan-cell');
    expect(orphan?.severity).toBe('warning');
    expect(orphan?.where).toEqual({ frameId: 'base', x: 0, y: 0 });
  });

  it('become an error when the art is speckled rather than shaded', () => {
    const faults = validateSemantics(
      broken((project) => {
        // Column 0 is empty in every row, so each of these touches nothing.
        for (let y = 0; y < 12; y += 2) project.frames[0].patch.push({ x: 0, y, index: 1 });
      }),
    );
    expect(faults.some((fault) => fault.code === 'orphan-cells')).toBe(true);
  });
});

describe('silhouette continuity', () => {
  it('catches a body that resolved into pieces', () => {
    const faults = validateSemantics(
      broken((project) => {
        project.frames[0].patch.push({ x: 0, y: 0, index: 1 }, { x: 1, y: 0, index: 1 }, { x: 0, y: 1, index: 1 }, { x: 1, y: 1, index: 1 });
      }),
    );
    const fault = faults.find((check) => check.code === 'silhouette-broken');
    expect(fault?.severity).toBe('error');
    expect(fault?.message).toMatch(/2 separate pieces/);
  });

  it('is not applied to artwork that says it is in pieces', () => {
    expect(
      codes(
        broken((project) => {
          project.detachedParts = true;
          project.frames[0].patch.push({ x: 0, y: 0, index: 1 }, { x: 1, y: 0, index: 1 }, { x: 0, y: 1, index: 1 }, { x: 1, y: 1, index: 1 });
        }),
      ),
    ).not.toContain('silhouette-broken');
  });
});

describe('palette hygiene', () => {
  it('reports a colour nothing uses, without blocking the compile', () => {
    const faults = validateSemantics(broken((project) => project.palette.colours.push({ hex: '#ff00ff', name: 'unused pink' })));
    expect(faults.map((fault) => fault.code)).toContain('palette-unused');
    expect(hasErrors(faults)).toBe(false);
  });

  it('reports a colour that covers a single cell', () => {
    const project = broken((project) => {
      project.palette.colours.push({ hex: '#ff00ff', name: 'lone pink' });
      project.frames[0].patch.push({ x: 4, y: 7, index: 6 });
    });
    expect(codes(project)).toContain('palette-single-use');
  });

  it('reports shading that sits alone, away from its own ramp', () => {
    const project = broken((project) => project.frames[0].patch.push({ x: 0, y: 15, index: 4 }));
    expect(codes(project)).toContain('palette-stray-shade');
  });
});
