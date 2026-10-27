import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { startToolCheckApp, type ToolCheckApp } from './helpers/tool-check/app';
import { cliCall, identityText, runTurn, userMessages } from './helpers/tool-check/probes/session-script';
import { STUB_MODEL_ID, STUB_PROVIDER_ID, type StubRequest, type StubReply } from './helpers/stub-model';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { waitForShell } from './helpers/workflow';

const EVIDENCE = path.resolve(__dirname, '../../..', 'docs/analysis/evidence/630');
const QUESTION = 'Should the research use the compact layout?';
const RESULT = 'A compact layout keeps the controls beside the result.';
let projectId = '';
type Phase = 'question' | 'research' | 'idle';
let phase: Phase = 'question';
const ownerTurns = new Map<number, Phase>();

function responder(request: StubRequest): StubReply | undefined {
  const identity = identityText(request);
  if (request.system.includes('You are the ROOM PLANNER')) return { text: JSON.stringify({
    title: 'Board verification research', approach: 'One researcher answers the layout question.', objective: 'Choose a layout.',
    successCriteria: ['Report the layout recommendation.'], roomInstructions: 'Read only. Report the recommendation.', collaborationStrategy: 'One member reports.', teamRationale: 'One researcher is sufficient.',
    workspacePolicy: { mode: 'read-only-shared' }, estimatedDurationMs: 60_000, estimatedCostUsd: 0.01, openAssumptions: [],
    members: [{ key: 'board-researcher', displayName: 'Board Researcher', role: 'Conductor', responsibility: 'Answer the layout question.', mandate: 'Report the recommendation.', reasonForInclusion: 'Research lead', isConductor: true, model: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`, thinking: 'off', promptAdditions: [], tools: ['read'], skills: [], permissions: 'read-only', needsWorktree: false }],
  }) };
  if (identity.includes('You are Board Researcher,')) { phase = 'idle'; return runTurn(request, [cliCall('room', { command: 'finish-room', summary: RESULT })], RESULT); }
  if (!identity.includes('You are the owner of Architect project')) return undefined;
  const owner = (action: string, extra: Record<string, unknown> = {}) => cliCall('architect', { action, projectId, ...extra });
  // A script is selected per turn, so a UI answer cannot alter a turn already in flight.
  const turn = userMessages(request).length;
  if (turn === 1) return runTurn(request, [owner('decide', { question: QUESTION, optionsJson: JSON.stringify([{ id: 'compact', label: 'Use compact layout', consequence: 'The controls stay together.' }, { id: 'wide', label: 'Use wide layout', consequence: 'The controls get more space.' }]), recommendation: 'compact', reason: 'The user chooses the layout.' })], 'Waiting for the layout choice.');
  if (!ownerTurns.has(turn)) ownerTurns.set(turn, phase);
  if (ownerTurns.get(turn) === 'research') return runTurn(request, [owner('research', { kind: 'room', question: 'Choose the compact layout.', stoppingCondition: 'One recommendation with a reason.' }), owner('sleep')], 'Research requested.');
  return runTurn(request, [owner('sleep')], 'Nothing else is needed.');
}

async function call(page: Page, params: Record<string, unknown>) {
  return page.evaluate((input) => window.sero.appAgent.invokeTool('architect', 'global', 'architect_projects', input), params);
}

async function board(page: Page) {
  await page.evaluate(async (id) => {
    globalThis.__sero_app_launch_params__ ??= new Map();
    globalThis.__sero_app_launch_params__.set('architect', { projectId: id });
    await window.sero.appControl.open('architect');
    window.dispatchEvent(new CustomEvent('sero:app-launch:architect', { detail: { projectId: id } }));
  }, projectId);
  await expect(page.locator('.bd-hero')).toBeVisible();
}

test('supervise real requests and a child result, then reopen the saved pause', async () => {
  test.setTimeout(600_000);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  let check: ToolCheckApp | undefined;
  let restarted: Awaited<ReturnType<typeof launchSeroApp>> | undefined;
  const stages: string[] = [];
  const save = async (page: Page, name: string) => { stages.push(name); await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) }); fs.writeFileSync(path.join(EVIDENCE, 'stages.json'), JSON.stringify(stages, null, 2)); };
  try {
    check = await startToolCheckApp({ override: responder });
    const page = check.page;
    await page.evaluate(() => window.sero.appControl.open('architect'));
    const created = await call(page, { action: 'create', idea: 'Verify a compact layout recommendation.', workspaceId: check.workspaceId, capUsd: 5 });
    fs.writeFileSync(path.join(EVIDENCE, 'create.json'), JSON.stringify(created, null, 2));
    projectId = (created.details as { projectId?: string } | undefined)?.projectId ?? /Project (\S+) "/.exec(created.text)?.[1] ?? '';
    expect(projectId).not.toBe('');
    await board(page);
    // Start through the same management tool the board uses. Its promise stays pending on the host grant.
    const resume = call(page, { action: 'resume', projectId });
    const requests = page.getByRole('region', { name: 'Pending requests' });
    await expect(requests.getByRole('button', { name: 'Allow', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`workspace-attention-${check.workspaceId}`)).toBeVisible();
    await save(page, '01-host-grant');
    await requests.getByRole('button', { name: 'Allow', exact: true }).click();
    await resume;
    await expect(requests).toHaveCount(0);
    expect((await page.evaluate(() => window.sero.userFeedback.getPending())).some((request) => request.questions[0]?.label === 'Allow agents to work here?')).toBe(false);
    await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible({ timeout: 60_000 });
    await save(page, '02-owner-question');
    phase = 'research';
    await page.getByRole('button', { name: /Use compact layout/ }).click();
    await expect(page.getByRole('heading', { name: QUESTION })).toHaveCount(0);
    await expect(page.getByTestId(`workspace-attention-${check.workspaceId}`)).toHaveCount(0);
    await expect(page.locator('.bd-made')).toContainText('Board verification research', { timeout: 180_000 });
    phase = 'idle';
    await page.locator('.bd-made summary').filter({ hasText: 'Board verification research' }).click();
    await expect(page.locator('.bd-made')).toContainText(RESULT);
    await save(page, '03-room-result');
    await page.getByRole('region', { name: 'Linked work' }).getByRole('button', { name: 'Open the Room', exact: true }).click();
    await expect(page.getByText('Board verification research', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.ar-app')).toHaveCount(0);
    await save(page, '04-first-room-navigation');
    await board(page);
    await call(page, { action: 'pause', projectId });
    await expect(page.locator('.bd-hero')).toContainText('Paused by you');
    await save(page, '05-paused');
    fs.writeFileSync(path.join(EVIDENCE, 'before-restart.json'), JSON.stringify(await call(page, { action: 'show', projectId }), null, 2));
    await closeSeroApp(check.app);
    restarted = await launchSeroApp({ seroHome: path.join(check.homePath, '.sero-ui/profiles/tool-check'), runtime: 'host', env: { SERO_FIXED_ROOT_OVERRIDE: path.join(check.homePath, '.sero-ui'), SERO_ARCHITECT_MODEL: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}` } });
    await waitForShell(restarted.page);
    await board(restarted.page);
    await expect(restarted.page.locator('.bd-hero')).toContainText('Paused by you');
    await save(restarted.page, '06-restarted-pause');
    fs.writeFileSync(path.join(EVIDENCE, 'after-restart.json'), JSON.stringify(await call(restarted.page, { action: 'show', projectId }), null, 2));
  } finally {
    if (check) fs.writeFileSync(path.join(EVIDENCE, 'app.log'), check.mainLog());
    if (restarted) await closeSeroApp(restarted.app);
    await check?.close();
  }
});
