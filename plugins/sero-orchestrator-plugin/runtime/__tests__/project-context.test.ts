/**
 * Optional project execution context (spec orchestrator-dispatch-handle).
 *
 * Creation carries project/run attribution and the tier defaults a caller
 * resolved before planning. The context is attribution only: an ordinary
 * caller without it keeps today's behaviour, and a saved request can never be
 * re-attributed to a different project.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ModelRunResult } from '../host';
import {
  checkOrchestratorProjectContext,
  resolveOrchestratorTriggerIntent,
  type OrchestratorProjectContext,
} from '@sero-ai/common';
import { Coordinator } from '../coordinator';
import { createFakeHost } from './fake-host';
import { oneStepPlan, planJson } from './fixtures';

const context: OrchestratorProjectContext = {
  projectId: 'hollow-depths',
  runId: 'run-initial',
  configRevision: 7,
  modelSnapshot: { MED: { provider: 'openai', modelId: 'gpt-5-codex', thinkingLevel: 'medium', source: 'project override' } },
};

describe('project correlation stays attribution only', () => {
  it('leaves an ordinary caller without context unchanged', () => {
    expect(checkOrchestratorProjectContext(undefined, null)).toEqual({ ok: true });
    expect(checkOrchestratorProjectContext(undefined, { projectId: 'any' })).toEqual({ ok: true });
  });

  it('accepts a context that names the owning project', () => {
    const checked = checkOrchestratorProjectContext(context, { projectId: 'hollow-depths' });
    expect(checked).toEqual({ ok: true, project: context });
  });

  it('refuses a foreign project and names both projects', () => {
    const checked = checkOrchestratorProjectContext(context, { projectId: 'ledger' });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toContain('hollow-depths');
    expect(checked.error).toContain('ledger');
  });

  it('refuses attribution from a workspace no project owns', () => {
    const checked = checkOrchestratorProjectContext(context, null);
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toContain('no project owns');
  });

  it('refuses an incomplete correlation', () => {
    const checked = checkOrchestratorProjectContext({ projectId: 'hollow-depths', runId: '' }, { projectId: 'hollow-depths' });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.error).toContain('projectId and a runId');
  });
});

describe('trigger intent', () => {
  it('defaults to unspecified so natural-language extraction still runs', () => {
    expect(resolveOrchestratorTriggerIntent(undefined)).toBe('unspecified');
    expect(resolveOrchestratorTriggerIntent({})).toBe('unspecified');
  });

  it('keeps the supplied meaning for a caller that only sets triggers', () => {
    expect(resolveOrchestratorTriggerIntent({ triggers: [{ type: 'cron', schedule: '0 9 * * 1' }] })).toBe('supplied');
  });

  it('honours an explicit intent over the inferred one', () => {
    expect(resolveOrchestratorTriggerIntent({ triggerIntent: 'one-off' })).toBe('one-off');
    expect(resolveOrchestratorTriggerIntent({ triggerIntent: 'one-off', triggers: [{ type: 'manual' }] })).toBe('one-off');
    expect(resolveOrchestratorTriggerIntent({ triggerIntent: 'supplied' })).toBe('supplied');
  });
});

describe('creation retains the project context', () => {
  it('saves the context before planning runs and keeps it after the plan lands', async () => {
    const host = createFakeHost();
    host.runStructured = async () => new Promise<ModelRunResult>(() => {});
    void new Coordinator(host).requestAction({ kind: 'create', prompt: 'Build the grid', options: { requestId: 'dispatch-1', project: context } });
    await vi.waitFor(() => expect(host.state.loops[0]?.creation?.attempts).toBe(1));
    expect(host.state.loops[0].project).toEqual(context);

    const restarted = createFakeHost({ initialState: structuredClone(host.state) });
    restarted.modelResponses.push({ response: planJson(oneStepPlan()) });
    const recovered = await new Coordinator(restarted).requestAction({ kind: 'create', prompt: 'Build the grid', options: { requestId: 'dispatch-1', project: context } });
    expect(recovered).toMatchObject({ ok: true });
    expect(restarted.state.loops[0].project).toEqual(context);
  });

  it('leaves the context absent for an ordinary caller', async () => {
    const host = createFakeHost();
    host.runStructured = async () => new Promise<ModelRunResult>(() => {});
    void new Coordinator(host).requestAction({ kind: 'create', prompt: 'Build the grid', options: { requestId: 'plain-1' } });
    await vi.waitFor(() => expect(host.state.loops[0]?.creation?.attempts).toBe(1));
    expect(host.state.loops[0].project).toBeUndefined();
  });

  it('refuses to re-attribute a saved request to another project', async () => {
    const host = createFakeHost();
    host.runStructured = async () => new Promise<ModelRunResult>(() => {});
    void new Coordinator(host).requestAction({ kind: 'create', prompt: 'Build the grid', options: { requestId: 'dispatch-2', project: context } });
    await vi.waitFor(() => expect(host.state.loops[0]?.creation?.attempts).toBe(1));

    const restarted = createFakeHost({ initialState: structuredClone(host.state) });
    restarted.runStructured = async () => new Promise<ModelRunResult>(() => {});
    const refused = await new Coordinator(restarted).requestAction({
      kind: 'create',
      prompt: 'Build the grid',
      options: { requestId: 'dispatch-2', project: { projectId: 'ledger', runId: 'run-1' } },
    });
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('different project') });
    expect(restarted.modelCalls).toHaveLength(0);
    expect(restarted.state.loops[0].project).toEqual(context);
  });
});
