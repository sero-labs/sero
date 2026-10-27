/**
 * The `orchestrator` tool: all 38 actions, run against real loops whose model
 * runs (planner, trigger, steps, recovery, reflection, revise, skill
 * extraction) the stub model answers. The effects are read from the plugin's
 * own files in the workspace and the profile.
 *
 * Order matters. The manual loop is made first, tuned, run once, reflected on,
 * mined for a skill and saved to the library. Then the recurring and recovery
 * loops run, so workspace reflection has three loops with history. The ask
 * loop and the catalog come next, and the cleanup deletes what is left.
 */
import { expectOk, expectText } from '../expect';
import type { ScenarioStep, ToolProbe } from '../types';
import { must } from './cron-memory-support';
import { catalogSteps } from './orchestrator-catalog';
import { readLibraryIndex, libraryStepsAfterRevise, libraryStepsBeforeRevise } from './orchestrator-library';
import { reflectionSteps, reflectWorkspaceStep, skillSteps } from './orchestrator-learning';
import { askSteps, deleteStep, recoverySteps, recurringSteps } from './orchestrator-loops';
import { manualSteps } from './orchestrator-manual';
import { removeOrchestratorResponder } from './orchestrator-stub';
import { indexedLoopIds } from './orchestrator-support';

/** The catalog's library entry is removed too, so the profile is left as the probe found it. */
const deleteCatalogEntry: ScenarioStep = {
  action: 'library_delete',
  params: (ctx) => ({ action: 'library_delete', entryId: String(ctx.state['orchestrator:catalogEntry']) }),
  async expect(result, ctx) {
    const id = String(ctx.state['orchestrator:catalogEntry']);
    expectText(result, `Deleted library entry ${id}.`);
    must(!(await readLibraryIndex(ctx)).entries.some((entry) => entry.id === id), 'the catalog entry is still in the library index');
  },
};

/** The last delete also takes the stub's answers away, whether or not it passed. */
function lastDelete(): ScenarioStep {
  const step = deleteStep('manual');
  return {
    ...step,
    async expect(result, ctx) {
      try {
        await step.expect(result, ctx);
      } finally {
        removeOrchestratorResponder(ctx);
      }
    },
  };
}

export const orchestratorProbe: ToolProbe = {
  tool: 'orchestrator',
  // About ten loop passes and a dozen background model runs, each through the app's agent sessions.
  timeoutMs: 1_200_000,
  steps: [
    ...manualSteps,
    ...reflectionSteps,
    ...skillSteps,
    ...libraryStepsBeforeRevise,
    ...libraryStepsAfterRevise,
    ...recurringSteps,
    ...recoverySteps,
    reflectWorkspaceStep,
    ...askSteps,
    ...catalogSteps,
    deleteCatalogEntry,
    deleteStep('catalog'),
    deleteStep('recovery'),
    deleteStep('recurring'),
    lastDelete(),
  ],
  // The site pass only lists, so it makes no loop at every site.
  siteStep: {
    action: 'list',
    params: { action: 'list' },
    async expect(result, ctx) {
      expectOk(result);
      const count = /(\d+) loop\(s\)\./.exec(result.text)?.[1];
      const listed = await indexedLoopIds(ctx);
      must(count !== undefined && Number(count) === listed.length, `list said ${result.text}, the index holds ${listed.length}`);
    },
  },
};
