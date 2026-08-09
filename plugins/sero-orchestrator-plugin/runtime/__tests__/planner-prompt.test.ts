import { describe, expect, it } from 'vitest';
import {
  PLANNING_SYSTEM_PROMPT,
  buildAgentCatalogBlock,
  buildPlanningTask,
  type PlanningTaskArgs,
} from '../planner-prompt';
import { DELIVERY_DESTINATION_IDS } from '../../shared/delivery-types';
import { deliverySpec } from '../delivery/registry';

const baseArgs: PlanningTaskArgs = {
  prompt: 'do a thing',
  useManagedWorktree: true,
  delivery: { destination: 'pr' },
};

describe('buildAgentCatalogBlock', () => {
  it('is empty when the workspace has no agents', () => {
    expect(buildAgentCatalogBlock([])).toBe('');
  });

  it('lists each agent with its description', () => {
    const block = buildAgentCatalogBlock([
      { name: 'reviewer', description: 'Careful code reviewer' },
      { name: 'researcher' },
    ]);
    expect(block).toContain('AVAILABLE AGENTS');
    expect(block).toContain('- reviewer: Careful code reviewer');
    expect(block).toContain('- researcher');
  });
});

describe('buildPlanningTask agent catalog', () => {
  it('includes the agent block when roles exist and omits it otherwise', () => {
    const withAgents = buildPlanningTask({ ...baseArgs, agentCatalog: [{ name: 'reviewer', description: 'r' }] });
    expect(withAgents).toContain('AVAILABLE AGENTS');
    expect(withAgents).toContain('- reviewer');

    const noAgents = buildPlanningTask(baseArgs);
    expect(noAgents).not.toContain('AVAILABLE AGENTS');
  });
});

describe('buildPlanningTask placement + delivery', () => {
  it('keeps the placement block independent of the destination', () => {
    const pr = buildPlanningTask(baseArgs);
    const chat = buildPlanningTask({ ...baseArgs, delivery: { destination: 'chat-post', params: { channel: '#intel' } } });
    expect(pr).toContain('isolated git branch');
    expect(chat).toContain('isolated git branch');

    const root = buildPlanningTask({ ...baseArgs, useManagedWorktree: false });
    expect(root).toContain('workspace files (no isolation)');
  });

  it("injects each destination's rules and receipt hint", () => {
    for (const id of DELIVERY_DESTINATION_IDS) {
      const task = buildPlanningTask({ ...baseArgs, delivery: { destination: id } });
      const spec = deliverySpec(id);
      expect(task).toContain(`destination: ${id}`);
      expect(task).toContain(spec.plannerRules);
      if (id !== 'workspace-files') expect(task).toContain(spec.receiptHint);
    }
  });

  it('renders declared delivery params verbatim', () => {
    const task = buildPlanningTask({ ...baseArgs, delivery: { destination: 'chat-post', params: { channel: '#intel' } } });
    expect(task).toContain('Declared delivery params');
    expect(task).toContain('#intel');

    expect(buildPlanningTask(baseArgs)).not.toContain('Declared delivery params');
  });

  it("swaps the pr rules to push-to-the-PR's-branch for event-pr loops (spec 15)", () => {
    const updating = buildPlanningTask({ ...baseArgs, worktreeBranchSource: 'event-pr' });
    expect(updating).toContain("checked out at that PR's OWN branch");
    expect(updating).toContain('NEVER open a new pull request');
    expect(updating).toContain(deliverySpec('pr').receiptHint); // receipt contract unchanged

    // Only the pr destination is affected, and only under event-pr.
    expect(buildPlanningTask(baseArgs)).not.toContain('NEVER open a new pull request');
    const chat = buildPlanningTask({ ...baseArgs, worktreeBranchSource: 'event-pr', delivery: { destination: 'chat-post' } });
    expect(chat).toContain(deliverySpec('chat-post').plannerRules);
  });

  it('keeps the two legacy behaviors intact (pr commit/PR, workspace-files leave-in-tree)', () => {
    const pr = buildPlanningTask(baseArgs);
    expect(pr).toContain('pull request');
    expect(pr).toContain('open pull requests listed in its run context');

    const files = buildPlanningTask({ ...baseArgs, useManagedWorktree: false, delivery: { destination: 'workspace-files' } });
    expect(files).toContain('no commit or PR is needed');
  });
});

describe('PLANNING_SYSTEM_PROMPT', () => {
  it('tells the planner it may assign an agent role to a background step', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('STEP AGENT');
    expect(PLANNING_SYSTEM_PROMPT).toContain('execution.agent');
  });

  it('steers human approval gates to the durable StepOutcome questions path, not an ask tool', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('HUMAN APPROVAL / INPUT GATES');
    expect(PLANNING_SYSTEM_PROMPT).toContain('StepOutcome "questions"');
    expect(PLANNING_SYSTEM_PROMPT).toMatch(/do NOT add an interactive/i);
  });

  it('forbids the planner from choosing placement or destination', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('or where results ship (the delivery destination)');
  });
  it('lets the planner extend wall-clock limits for long-running work', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('"maxWallClockMs"');
    expect(PLANNING_SYSTEM_PROMPT).toContain('realistic wall-clock');
  });

});

describe('buildPlanningTask catalog baseline (spec 14 adaptation)', () => {
  it('omits the baseline block for ordinary planning', () => {
    expect(buildPlanningTask(baseArgs)).not.toContain('ADAPTING AN INSTALLED CATALOG LOOP');
  });

  it('renders the curated definition and the adapt-not-redesign instruction', () => {
    const task = buildPlanningTask({
      ...baseArgs,
      baseline: {
        schemaVersion: 1,
        prompt: 'p',
        title: 'CI fixer',
        summary: 's',
        plan: { schemaVersion: 1, revision: 0, objective: 'fix ci', steps: [] },
        triggers: [{ type: 'event', eventSource: 'github:ci-failed' }],
        limits: {} as never,
        logPolicy: {} as never,
      },
    });
    expect(task).toContain('ADAPTING AN INSTALLED CATALOG LOOP');
    expect(task).toContain('"CI fixer"');
    expect(task).toContain('github:ci-failed');
    expect(task).toContain('clarifyingQuestions');
  });
});
