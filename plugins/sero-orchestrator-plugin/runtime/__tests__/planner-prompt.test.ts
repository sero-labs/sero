import { describe, expect, it } from 'vitest';
import {
  PLANNING_SYSTEM_PROMPT,
  buildAgentCatalogBlock,
  buildPlanningTask,
} from '../planner-prompt';

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
    const withAgents = buildPlanningTask('do a thing', true, [], [], [{ name: 'reviewer', description: 'r' }]);
    expect(withAgents).toContain('AVAILABLE AGENTS');
    expect(withAgents).toContain('- reviewer');

    const noAgents = buildPlanningTask('do a thing', true, [], [], []);
    expect(noAgents).not.toContain('AVAILABLE AGENTS');
  });
});

describe('PLANNING_SYSTEM_PROMPT', () => {
  it('tells the planner it may assign an agent role to a background step', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('STEP AGENT');
    expect(PLANNING_SYSTEM_PROMPT).toContain('execution.agent');
  });
});
