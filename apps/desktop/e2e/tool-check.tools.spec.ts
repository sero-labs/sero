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
import { readCodemodeSurface, rejectionSteps, runAt, sessionSurface, sitePassSteps, type SiteSurface } from './helpers/tool-check/site-pass';
import { runInChat } from './helpers/tool-check/sites';
import { runInSubagent } from './helpers/tool-check/subagent-site';
import { surfaceOf, type SessionSurface } from './helpers/tool-check/surface';
import { TOOL_PROBES } from './helpers/tool-check/table';
import type { ToolCheckSite } from './helpers/tool-check/types';
import { runInWorkflowWorker } from './helpers/tool-check/workflow-worker';

const ONLY = new Set((process.env.SERO_TOOL_CHECK_ONLY ?? '').split(',').map((name) => name.trim()).filter(Boolean));
const PROBES = ONLY.size ? TOOL_PROBES.filter((probe) => ONLY.has(probe.tool)) : TOOL_PROBES;

let check: ToolCheckApp;
let fixtures: RunningFixtures;
let chat: SessionSurface;
let subagent: SessionSurface;
/** What each session site was given, in the order the action pass tries them. */
const sites: SiteSurface[] = [];

/** Reports a run that never ended, against the last step it recorded, and logs any failure. */
async function report(site: ToolCheckSite, tool: string, run: Promise<{ failure?: string }>): Promise<void> {
  const failure = await run.then((outcome) => outcome.failure, (error: unknown) => {
    const message = `the turn did not end: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`;
    // The steps may all have passed; the session still failed after the last of them.
    const last = check.ledger.ledger.rows.filter((row) => row.site === site && (tool === 'site pass' || row.tool === tool)).at(-1);
    check.ledger.record({ site, tool: last?.tool ?? tool, action: last?.action ?? null, result: 'fail', ms: 0, error: message });
    return message;
  });
  if (!failure) return;
  console.log(`${tool} at ${site} stopped: ${failure}\nmain process, last lines:\n${check.mainLog().split('\n').slice(-30).join('\n')}`);
  test.info().annotations.push({ type: 'tool check failure', description: `${site}: ${failure}` });
}

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
    sites.push(sessionSurface('chat', chat, TOOL_PROBES));
  });

  test('reads what a subagent and a Workflow worker are given', async () => {
    test.setTimeout(300_000);
    subagent = (await runInSubagent(check, { tool: 'surface', steps: [], via: 'direct', fixtures: fixtures.values })).surface;
    sites.push(sessionSurface('subagent', subagent, TOOL_PROBES));
    const worker = await runInWorkflowWorker(check, { tool: 'surface', steps: [], via: 'direct', fixtures: fixtures.values, defaultTools: true });
    expect(worker.createResult).toContain('(status: complete)');
    sites.push(sessionSurface('workflow-worker', worker.surface, TOOL_PROBES));
  });

  for (const probe of PROBES) {
    test(probe.tool, async () => {
      test.setTimeout(Math.max(300_000, (probe.timeoutMs ?? 0) + 60_000));
      // The first site, in the design's order, whose session is given the tool.
      const home = sites.find((site) => site.route(probe.tool) !== null);
      test.skip(!home, `no site is given ${probe.tool}`);
      const site = home!.site;
      const exempt = new Set((probe.exemptions ?? []).map((exemption) => exemption.action));
      const steps = probe.steps.filter((step) => !exempt.has(step.action));
      check.ledger.plan(requiredActions([probe]).map(({ tool, action }) => ({ tool, action, site })));
      // A failed test makes Playwright start a new worker, and with it a new
      // app and an empty ledger. So a probe only reports its failure; the
      // ledger check below fails the run, with every failure listed.
      await report(site, probe.tool, runAt(check, site, { tool: probe.tool, steps, via: home!.route(probe.tool)!, fixtures: fixtures.values, timeoutMs: probe.timeoutMs }));
    });
  }

  const SITE_PASS: ToolCheckSite[] = ['chat', 'subagent', 'workflow-worker', 'codemode-chat', 'codemode-subagent'];
  for (const site of SITE_PASS) {
    test(`site pass: ${site}`, async () => {
      test.setTimeout(1_800_000);
      const surface = site === 'codemode-chat' ? await readCodemodeSurface(check, site, chat, TOOL_PROBES, fixtures.values)
        : site === 'codemode-subagent' ? await readCodemodeSurface(check, site, subagent, TOOL_PROBES, fixtures.values)
          : sites.find((entry) => entry.site === site)!;
      const tools = ONLY.size ? surface.tools.filter((tool) => ONLY.has(tool)) : surface.tools;
      check.ledger.siteTools(site, tools);
      const { steps, missing } = sitePassSteps({ ...surface, tools }, TOOL_PROBES);
      if (site.startsWith('codemode')) steps.push(...rejectionSteps({ ...surface, tools }, TOOL_PROBES));
      if (missing.length) console.log(`${site} was given tools with no step to run: ${missing.join(', ')}`);
      await report(site, 'site pass', runAt(check, site, { tool: 'site pass', label: 'site pass', steps, via: 'direct', fixtures: fixtures.values, continueOnFailure: true, timeoutMs: 1_700_000 }));
    });
  }

  test('the run proved every non-exempt action', () => {
    for (const line of exemptionReport(TOOL_PROBES)) console.log(`exempt: ${line}`);
    expect(ledgerProblems(check.ledger.ledger, TOOL_PROBES)).toEqual([]);
  });
});
