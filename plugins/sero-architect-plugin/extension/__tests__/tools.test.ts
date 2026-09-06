import { afterEach, describe, expect, it } from 'vitest';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { buildOwnerActionInput } from '../owner-tool';
import { PROJECT_ACTIONS, PROJECTS_TOOL_DESCRIPTION, ProjectsToolParams, executeProjectsTool } from '../projects-tool';
import { registerArchitectRuntime, unregisterArchitectRuntime, type ArchitectRegistryEntry } from '../../runtime/registry';

const ctxFor = (sessionPath: string): ExtensionContext =>
  ({ cwd: '/w', sessionManager: { getSessionFile: () => sessionPath } }) as unknown as ExtensionContext;

describe('the architect tools', () => {
  let registered: ArchitectRegistryEntry | null = null;
  afterEach(() => { if (registered) unregisterArchitectRuntime(registered); registered = null; });

  it('refuses the management tool to an owner session, so the owner cannot approve its own gates', async () => {
    const calls: string[] = [];
    registered = {
      owner: { owns: async (signals) => (signals.sessionPath === '/s/owner.jsonl' ? ({ id: 'p1' } as never) : null), execute: async () => ({ ok: true, text: '' }) },
      projects: { approve: async () => { calls.push('approve'); return { ok: true, text: 'approved' }; } } as unknown as ArchitectRegistryEntry['projects'],
    };
    registerArchitectRuntime(registered);
    const refused = await executeProjectsTool({ action: 'approve', projectId: 'p1', target: 'charter' }, ctxFor('/s/owner.jsonl'));
    expect(refused.details.ok).toBe(false);
    expect(refused.content[0]?.text).toContain('for the user');
    const allowed = await executeProjectsTool({ action: 'approve', projectId: 'p1', target: 'charter' }, ctxFor('/s/user-chat.jsonl'));
    expect(allowed.details.ok).toBe(true);
    expect(calls).toEqual(['approve']);
  });

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
