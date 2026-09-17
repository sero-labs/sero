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

  it('asks for a trace summary without asking for record detail', async () => {
    const queries: { projectId: string; query: unknown }[] = [];
    const answer = {
      projectId: 'p1', journalId: 'shared', recorded: false,
      summary: { attributableUsd: 0.3, aggregateUsd: 0.1, hasAggregate: true, incomplete: false, records: 4 },
      timing: { activeMs: 0, workerMs: 0, waitMs: 0, waitByCause: {} },
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, unavailable: [] },
    };
    registered = {
      owner: { owns: async () => null, execute: async () => ({ ok: true, text: '' }) },
      projects: {
        trace: async (projectId: string, query: unknown) => { queries.push({ projectId, query }); return answer; },
      } as unknown as ArchitectRegistryEntry['projects'],
    };
    registerArchitectRuntime(registered);

    const summary = await executeProjectsTool({ action: 'trace', projectId: 'p1', knownSpendUsd: 0.25 }, ctxFor('/s/user-chat.jsonl'));
    expect(summary.details.ok).toBe(true);
    // Detail is opt-in, so a summary request never asks for the records.
    expect(queries[0]).toMatchObject({ projectId: 'p1', query: { detail: false, knownSpendUsd: 0.25 } });
    expect(summary.details.records).toBeUndefined();
    expect(summary.details.summary).toMatchObject({ attributableUsd: 0.3 });
    // The inspector reads this flag from the tool result, so it must cross the seam.
    expect(summary.details.recorded).toBe(false);

    await executeProjectsTool({ action: 'trace', projectId: 'p1', detail: true, limit: 5 }, ctxFor('/s/user-chat.jsonl'));
    expect(queries[1]).toMatchObject({ query: { detail: true, limit: 5 } });
  });

  it('passes intake model overrides through to create', async () => {
    let received: unknown;
    registered = {
      owner: { owns: async () => null, execute: async () => ({ ok: true, text: '' }) },
      projects: {
        create: async (input: unknown) => { received = input; return { ok: true, text: 'created', projectId: 'p1' }; },
      } as unknown as ArchitectRegistryEntry['projects'],
    };
    registerArchitectRuntime(registered);
    const models = [{ tier: 'MED', model: 'anthropic/claude-fable-5-1', thinking: 'low' }];
    await executeProjectsTool({ action: 'create', idea: 'x', folder: '~/p', models }, ctxFor('/s/user-chat.jsonl'));
    expect(received).toMatchObject({ idea: 'x', folder: '~/p', models });
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
