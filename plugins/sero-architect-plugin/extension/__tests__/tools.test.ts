import { describe, expect, it } from 'vitest';
import { buildOwnerActionInput } from '../owner-tool';
import { PROJECT_ACTIONS, PROJECTS_TOOL_DESCRIPTION, ProjectsToolParams } from '../projects-tool';

describe('the architect tools', () => {
  it('lists every management action in the description the CLI help is built from', () => {
    for (const action of ['create', 'pause', 'resume', 'stop', 'raise_cap', 'set_autonomy', 'answer', 'directive', 'delete']) {
      expect(PROJECT_ACTIONS).toContain(action);
      expect(PROJECTS_TOOL_DESCRIPTION).toContain(action);
    }
    for (const action of PROJECT_ACTIONS) expect(JSON.stringify(ProjectsToolParams.properties.action)).toContain(`"${action}"`);
  });

  it('reports the reserved evidence keys a call carries, so the runtime can refuse them', () => {
    const input = buildOwnerActionInput({ action: 'evidence', projectId: 'p', milestoneId: 'm1', commandsJson: '["pnpm test"]', exitCode: 0, capturePath: '/x.png' });
    expect(input).toMatchObject({ commands: ['pnpm test'], extraKeys: ['exitCode', 'capturePath'] });
  });

  it('splits parks and rejects malformed commands', () => {
    expect(buildOwnerActionInput({ action: 'decide', projectId: 'p', parks: 'm1, m2' })).toMatchObject({ parks: ['m1', 'm2'] });
    expect(buildOwnerActionInput({ action: 'evidence', projectId: 'p', commandsJson: '{' })).toEqual({ error: 'commandsJson is not valid JSON.' });
  });
});
