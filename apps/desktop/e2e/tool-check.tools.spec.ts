/**
 * The tool check (spec `session-tool-surface`): every agent tool action runs
 * for real against a fresh profile and workspace, driven by the stub model.
 *
 * `SERO_E2E_RUNTIME` picks the runtime: host by default, `docker` on Linux or
 * `apple-container` on a Mac. `SERO_TOOL_CHECK_ONLY=bash,sero git` runs only
 * the named tools, which is for checking one fix; the ledger comparison then
 * fails, because the rest did not run.
 */
import { test, expect } from '@playwright/test';
import { startToolCheckApp, type ToolCheckApp } from './helpers/tool-check/app';
import { startFixtures, type RunningFixtures } from './helpers/tool-check/fixtures';
import { exemptionReport, ledgerProblems, requiredActions } from './helpers/tool-check/ledger';
import { runInChat } from './helpers/tool-check/sites';
import { routeTo, surfaceOf, type SessionSurface } from './helpers/tool-check/surface';
import { TOOL_PROBES } from './helpers/tool-check/table';
import { runInWorkflowWorker, STEP_TOOLS } from './helpers/tool-check/workflow-worker';
import { writeProbe } from './helpers/tool-check/probes/write';

const ONLY = new Set((process.env.SERO_TOOL_CHECK_ONLY ?? '').split(',').map((name) => name.trim()).filter(Boolean));
const PROBES = ONLY.size ? TOOL_PROBES.filter((probe) => ONLY.has(probe.tool)) : TOOL_PROBES;

let check: ToolCheckApp;
let fixtures: RunningFixtures;
let chat: SessionSurface;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  check = await startToolCheckApp();
  fixtures = await startFixtures(check);
});

test.afterAll(async () => {
  try {
    await fixtures?.close();
  } finally {
    await check?.close();
  }
});

test.describe.serial('action pass', () => {
  test('reads what a chat is given', async () => {
    const config = await check.page.evaluate((id) => window.sero.workspace.getRuntimeConfig(id), check.workspaceId);
    expect(config.backend).toBe(check.runtime);
    await runInChat(check, { tool: 'surface', steps: [], via: 'direct', fixtures: fixtures.values });
    const surface = surfaceOf(check.stub.server, 'tool-check surface direct');
    if (!surface) throw new Error('the chat never reached the stub');
    chat = surface;
  });

  for (const probe of PROBES) {
    test(probe.tool, async () => {
      test.setTimeout(300_000);
      const via = routeTo(chat, probe.tool);
      test.skip(via === null, `a chat is not given ${probe.tool}`);
      const exempt = new Set((probe.exemptions ?? []).map((exemption) => exemption.action));
      const steps = probe.steps.filter((step) => !exempt.has(step.action));
      check.ledger.plan(requiredActions([probe]).map(({ tool, action }) => ({ tool, action, site: 'chat' as const })));
      // A failed test makes Playwright start a new worker, and with it a new
      // app and an empty ledger. So a probe only reports its failure; the
      // ledger check below fails the run, with every failure listed.
      const failure = await runInChat(check, { tool: probe.tool, steps, via: via!, fixtures: fixtures.values })
        .then((outcome) => outcome.failure, (error: unknown) => (error instanceof Error ? error.message : String(error)));
      if (failure) {
        console.log(`${probe.tool} stopped: ${failure}`);
        test.info().annotations.push({ type: 'tool check failure', description: failure });
      }
    });
  }

  test('a Workflow worker runs a check step', async () => {
    test.setTimeout(300_000);
    const worker = await runInWorkflowWorker(check, { tool: writeProbe.tool, steps: writeProbe.steps, via: 'direct', fixtures: fixtures.values });
    console.log(`step session tools: ${worker.surface.tools.join(', ')}`);
    expect(worker.createResult).toContain('(status: complete)');
    expect(worker.surface.tools).toEqual(expect.arrayContaining(STEP_TOOLS));
    expect(worker.failure).toBeUndefined();
  });

  test('the run proved every non-exempt action', () => {
    for (const line of exemptionReport(TOOL_PROBES)) console.log(`exempt: ${line}`);
    expect(ledgerProblems(check.ledger.ledger, TOOL_PROBES)).toEqual([]);
  });
});
