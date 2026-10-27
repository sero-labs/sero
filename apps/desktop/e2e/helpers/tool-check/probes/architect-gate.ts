/**
 * Puts the steps of two sessions into one order. The Architect story is one
 * line of events, some made by the user (a chat running `architect_projects`)
 * and some by the project's owner (a session running `architect`). Each step
 * waits in its `setup` until the step before it, in the other session or the
 * same one, has finished its `expect`, and says it is done when its own ends.
 *
 * A step that fails still lets the next one start, so one fault does not hide
 * the rest. A step that never finishes (a session that stopped) is waited for
 * only so long.
 */
import type { ScenarioStep, StepContext, StepParams } from '../types';

/** The longest one step is waited for. A step that takes longer has been lost. */
const LONGEST_STEP_MS = 8 * 60_000;

interface Latch {
  done: boolean;
  settle: () => void;
  finished: Promise<void>;
}

function latch(): Latch {
  let settle: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => { settle = resolve; });
  const state: Latch = { done: false, settle: () => { state.done = true; settle(); }, finished };
  return state;
}

export class Sequence {
  private readonly latches: Latch[];

  constructor(total: number) {
    this.latches = Array.from({ length: total }, latch);
  }

  /** Resolves once the step before `index` has finished, or has been waited for long enough. */
  async turn(index: number): Promise<void> {
    const before = this.latches[index - 1];
    if (!before || before.done) return;
    let timer: NodeJS.Timeout | undefined;
    const lost = new Promise<void>((resolve) => { timer = setTimeout(resolve, LONGEST_STEP_MS); });
    try {
      await Promise.race([before.finished, lost]);
    } finally {
      clearTimeout(timer);
    }
  }

  complete(index: number): void {
    this.latches[index]?.settle();
  }
}

/** The sequence the pair runner is running. Absent outside a run, when steps are not ordered. */
let running: Sequence | undefined;

export function beginSequence(total: number): void {
  running = new Sequence(total);
}

export function endSequence(): void {
  running = undefined;
}

/** One step of the story and the session that runs it. */
export interface StoryEntry {
  actor: 'owner' | 'chat';
  /** The project the step belongs to: the deprecated charter flow, or the main one. */
  project: 'charter' | 'main';
  step: ScenarioStep;
}

/** The entry's step, ordered by its place in the story. */
export function sequenced(entry: StoryEntry, index: number): ScenarioStep {
  const { step } = entry;
  const params = (ctx: StepContext): StepParams => {
    try {
      return typeof step.params === 'function' ? step.params(ctx) : step.params;
    } catch (error) {
      running?.complete(index);
      throw error;
    }
  };
  return {
    action: step.action,
    params,
    setup: async (ctx) => {
      try {
        await running?.turn(index);
        await step.setup?.(ctx);
      } catch (error) {
        running?.complete(index);
        throw error;
      }
    },
    expect: async (result, ctx) => {
      try {
        await step.expect(result, ctx);
      } finally {
        running?.complete(index);
      }
    },
    ...(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs }),
  };
}

export const owner = (project: StoryEntry['project'], step: ScenarioStep): StoryEntry => ({ actor: 'owner', project, step });
export const user = (project: StoryEntry['project'], step: ScenarioStep): StoryEntry => ({ actor: 'chat', project, step });
