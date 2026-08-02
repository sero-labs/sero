/**
 * The rig plan replaces two things the spike guessed by hand — where each
 * piece joins and what stacks in front of what — so the tests are about
 * refusing a plan that would put them back to guesswork.
 */
import { describe, expect, it } from 'vitest';
import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { EMPTY_MODEL_SELECTION } from '../../../shared/settings';
import type { RigPlan } from './rig-plan';
import { createRigSheetTool, planProblems, planRig } from './rig-plan';

const images = { sheet: Buffer.from('s'), assembled: Buffer.from('a') };
const sizes = [
  { width: 19, height: 22 },
  { width: 25, height: 31 },
  { width: 21, height: 38 },
  { width: 19, height: 37 },
];

function piece(over: Partial<RigPlan['pieces'][number]> = {}): RigPlan['pieces'][number] {
  return { index: 0, name: 'helmet', slot: 'head', side: 'near', z: 5, anchorX: 0.5, anchorY: 0.95, ...over };
}

const goodPlan: RigPlan = {
  pieces: [
    piece(),
    piece({ index: 1, name: 'torso', slot: 'torso', z: 3, anchorY: 0.05 }),
    piece({ index: 2, name: 'arm', slot: 'upper_arm', side: 'both', z: 6, anchorY: 0.1 }),
    piece({ index: 3, name: 'leg', slot: 'leg', side: 'both', z: 4, anchorY: 0.05 }),
  ],
  note: '',
};

/** A host whose planner session runs `script`. */
function makeHost(script: (tools: Map<string, { execute(id: string, p: unknown): Promise<unknown> }>) => Promise<void>) {
  return {
    subagents: {
      async runStructured(params: AppRuntimeSubagentRunParams) {
        const tools = new Map(
          (params.customTools as unknown as { name: string; execute(id: string, p: unknown): Promise<unknown> }[]).map(
            (tool) => [tool.name, tool],
          ),
        );
        await script(tools);
        return { response: 'done' };
      },
    },
  } as unknown as AppRuntimeHost;
}

const context = (host: AppRuntimeHost) => ({
  host,
  workspaceId: 'ws',
  parentSessionId: 'session',
  model: EMPTY_MODEL_SELECTION,
  signal: new AbortController().signal,
});

describe('planProblems', () => {
  it('accepts a plan that names a head, a torso and enough of a body', () => {
    expect(planProblems(goodPlan, 4)).toEqual([]);
  });

  it('refuses an anchor outside the piece itself', () => {
    // An anchor is a fraction of the piece; 1.4 would swing the limb around a
    // point that is not on it.
    const broken = { ...goodPlan, pieces: [...goodPlan.pieces, piece({ index: 3, anchorY: 1.4 })] };
    expect(planProblems(broken, 4).join(' ')).toMatch(/anchor outside itself/);
  });

  it('refuses a piece index the sheet does not have', () => {
    const broken = { ...goodPlan, pieces: [piece({ index: 99 })] };
    expect(planProblems(broken, 4).join(' ')).toMatch(/not one of the 4 pieces/);
  });

  it('refuses the same piece placed twice', () => {
    const broken = { ...goodPlan, pieces: [...goodPlan.pieces, piece({ index: 1, slot: 'hips' })] };
    expect(planProblems(broken, 4).join(' ')).toMatch(/more than once/);
  });

  it('refuses a plan with no head or no torso', () => {
    const headless = { ...goodPlan, pieces: goodPlan.pieces.map((p) => (p.slot === 'head' ? { ...p, slot: 'accessory' as const } : p)) };
    expect(planProblems(headless, 4).join(' ')).toMatch(/nothing was placed as the head/);
  });

  it('refuses a plan that placed almost nothing', () => {
    const thin = { pieces: [piece(), piece({ index: 1, slot: 'torso' })], note: '' };
    expect(planProblems(thin, 4).join(' ')).toMatch(/not a figure/);
  });
});

describe('planRig', () => {
  it('returns the plan when the planner looked and answered', async () => {
    const host = makeHost(async (tools) => {
      await tools.get('puppet_rig_show')!.execute('a', {});
      await tools.get('puppet_rig_plan')!.execute('b', goodPlan);
    });
    const outcome = await planRig(images, sizes, context(host));
    if (outcome.status !== 'planned') throw new Error(outcome.reason);
    expect(outcome.plan.pieces).toHaveLength(4);
  });

  it('is unavailable — never a default rig — when the planner never looked', async () => {
    // A rig from a session that saw no pictures is a guess with authority,
    // which is exactly what this call exists to stop.
    const host = makeHost(async (tools) => {
      await tools.get('puppet_rig_plan')!.execute('b', goodPlan);
    });
    const outcome = await planRig(images, sizes, context(host));
    expect(outcome.status).toBe('unavailable');
    if (outcome.status === 'unavailable') expect(outcome.reason).toMatch(/never looked/);
  });

  it('is unavailable when the plan it recorded would not rig', async () => {
    const host = makeHost(async (tools) => {
      await tools.get('puppet_rig_show')!.execute('a', {});
      await tools.get('puppet_rig_plan')!.execute('b', { pieces: [piece({ anchorY: 3 })], note: '' });
    });
    const outcome = await planRig(images, sizes, context(host));
    expect(outcome.status).toBe('unavailable');
    if (outcome.status === 'unavailable') expect(outcome.reason).toMatch(/not usable/);
  });

  it('shows the assembled figure as well as the pieces', async () => {
    const tool = createRigSheetTool(images);
    const result = (await tool.definition.execute?.('a', {}, {} as never, {} as never, {} as never)) as {
      content: { type: string }[];
    };
    expect(result.content.filter((entry) => entry.type === 'image')).toHaveLength(2);
    expect(tool.looked()).toBe(true);
  });
});
