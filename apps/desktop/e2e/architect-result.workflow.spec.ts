import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { ProjectRecord } from '../../../plugins/sero-architect-plugin/shared/record';
import { startToolCheckApp, type ToolCheckApp } from './helpers/tool-check/app';
import { cliCall, identityText, runTurn, userMessages, type ScriptedCall } from './helpers/tool-check/probes/session-script';
import { architectWorkResponder } from './helpers/tool-check/probes/architect-stub';
import type { StubRequest, StubReply } from './helpers/stub-model';

const EVIDENCE = path.resolve(__dirname, 'screenshots/architect-result-631');
const LOGS = '/private/tmp/sero-v1-tools/631-logs';
const REQUEST = 'Repair truncate so its output never exceeds the limit. Keep other behavior unchanged.';
const CHANGE = 'Also return an empty string for a negative limit.';
const RESULT = 'truncate now keeps its output within the limit; the saved node checks pass.';
const NEXT_RESULT = 'The negative-limit change is delivered and both node checks pass.';
let check: ToolCheckApp;
let projectId = '';
const turns = new Map<number, 'repair' | 'accept' | 'change' | 'accept-change' | 'idle'>();
const c1 = { id: 'c1', text: 'Output never exceeds a nonnegative limit.', userStated: true };
const c2 = { id: 'c2', text: 'Negative limits return an empty string.', userStated: true };

function record(): ProjectRecord | null {
  if (!check || !projectId) return null;
  const file = path.join(check.homePath, '.sero-ui/profiles/tool-check/apps/architect/projects', `${projectId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function responder(request: StubRequest): StubReply | undefined {
  if (!identityText(request).includes('You are the owner of Architect project')) return architectWorkResponder(request);
  const saved = record();
  const second = saved?.milestones.find((item) => item.title === 'Handle negative limits');
  const turn = userMessages(request).length;
  if (!turns.has(turn)) {
    const first = saved?.milestones.find((item) => item.id === 'm1');
    turns.set(turn, !first ? 'repair' : first.evidence?.passed && first.status !== 'done' ? 'accept'
      : saved?.directives.some((item) => item.text === CHANGE && !item.reply) ? 'change'
        : second?.evidence?.passed && second.status !== 'done' ? 'accept-change' : 'idle');
  }
  const stage = turns.get(turn);
  const owner = (action: string, extra: Record<string, unknown> = {}) => cliCall('architect', { action, projectId, ...extra });
  const changing = stage === 'change';
  // Maintenance is also a milestone entry. Use the record's identity, not an
  // assumed ordinal for the change that the owner just created.
  const id = changing || stage === 'accept-change' ? second?.id ?? '' : 'm1';
  const executionId = saved?.milestones.find((item) => item.id === id)?.direct?.id ?? '';
  const calls: ScriptedCall[] = [];
  if (stage === 'repair' || changing) {
    if (changing) calls.push(owner('reply', { directiveId: saved?.directives.find((item) => item.text === CHANGE)?.id, text: 'I will add negative-limit handling and check it.' }));
    calls.push(
      owner('working', { objective: changing ? CHANGE : REQUEST, approach: 'Repair the helper and run its node tests.', criteriaJson: JSON.stringify(changing ? [c1, c2] : [c1]), ...(changing ? { reason: 'The user requested negative-limit handling.' } : {}) }),
      owner('milestone', { title: changing ? 'Handle negative limits' : 'Repair truncate', plan: 'Edit truncate.cjs and check its behavior with node --test.' }),
      owner('work', { operation: 'begin', milestoneId: id }),
      { name: 'write', arguments: { path: path.join(check.workspaceDir, 'truncate.cjs'), content: `module.exports = (text, max) => ${changing ? "max < 0 ? '' : " : ''}text.length > max ? text.slice(0, Math.max(0, max - 3)) + '.'.repeat(Math.min(3, max)) : text;\n` } },
      owner('work', { operation: 'report', executionId, text: changing ? 'Added negative-limit handling.' : 'Fixed overlong truncated output.', destination: 'workspace-files' }),
      owner('evidence', { milestoneId: id, commandsJson: JSON.stringify([changing ? 'node --test repair.test.cjs negative.test.cjs' : 'node --test repair.test.cjs']), criteria: changing ? 'c1,c2' : 'c1' }),
      owner('sleep'),
    );
  } else if (stage === 'accept' || stage === 'accept-change') {
    calls.push(owner('milestone', { milestoneId: id, done: true }), owner('summary', { field: 'result', text: stage === 'accept' ? RESULT : NEXT_RESULT, sourceKind: 'milestone', sourceId: id }), owner('sleep'));
  } else calls.push(owner('sleep'));
  return runTurn(request, calls, 'Waiting for the next event.');
}

const call = (page: Page, params: Record<string, unknown>) => page.evaluate((input) => window.sero.appAgent.invokeTool('architect', 'global', 'architect_projects', input), params);

async function openBoard(page: Page) {
  await page.evaluate(async (id) => {
    globalThis.__sero_app_launch_params__ ??= new Map();
    globalThis.__sero_app_launch_params__.set('architect', { projectId: id });
    await window.sero.appControl.open('architect');
    window.dispatchEvent(new CustomEvent('sero:app-launch:architect', { detail: { projectId: id } }));
  }, projectId);
  await expect(page.locator('.bd-hero')).toBeVisible();
}

test('assess a real repair result and request a subsequent change', async () => {
  test.setTimeout(360_000);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  const stages: string[] = [];
  const save = async (name: string) => {
    await check.page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) });
    fs.writeFileSync(path.join(LOGS, `${name}-record.json`), JSON.stringify(record(), null, 2));
    stages.push(name);
  };
  try {
    check = await startToolCheckApp({ override: responder });
    const page = check.page;
    fs.writeFileSync(path.join(check.workspaceDir, 'truncate.cjs'), "module.exports = (text, max) => text.length > max ? text.slice(0, max) + '...' : text;\n");
    fs.writeFileSync(path.join(check.workspaceDir, 'repair.test.cjs'), "const {test} = require('node:test'); const assert = require('node:assert/strict'); const truncate = require('./truncate.cjs'); test('truncation fits every nonnegative limit', () => { for (const max of [0, 1, 2, 3, 4, 6, 20]) assert.ok(truncate('abcdef', max).length <= max); assert.equal(truncate('ab', 5), 'ab'); });\n");
    fs.writeFileSync(path.join(check.workspaceDir, 'negative.test.cjs'), "const {test} = require('node:test'); const assert = require('node:assert/strict'); const truncate = require('./truncate.cjs'); test('negative limits are empty', () => assert.equal(truncate('abc', -1), ''));\n");
    const created = await call(page, { action: 'create', idea: REQUEST, workspaceId: check.workspaceId, capUsd: 5, executionMode: 'workspace' });
    projectId = (created.details as { projectId?: string } | undefined)?.projectId ?? /Project (\S+) "/.exec(created.text)?.[1] ?? '';
    expect(projectId).not.toBe('');
    await call(page, { action: 'set_autonomy', projectId, autonomy: 'charter-only' });
    await openBoard(page);
    const resume = call(page, { action: 'resume', projectId });
    await page.getByRole('region', { name: 'Pending requests' }).getByRole('button', { name: 'Allow', exact: true }).click({ timeout: 60_000 });
    await resume;
    const result = page.getByRole('region', { name: 'Result', exact: true });
    await expect(result).toContainText(RESULT, { timeout: 180_000 });
    await expect.poll(() => record()?.milestones.find((item) => item.id === 'm1')?.verification).toBe('delivered');
    await result.getByText('Requested outcome', { exact: true }).click();
    await expect(result).toContainText(REQUEST);
    await result.locator('summary').filter({ hasText: 'Evidence at' }).click();
    await expect(result).toContainText('node --test repair.test.cjs');
    await save('01-repair-result');
    await result.getByRole('button', { name: 'Open result', exact: true }).click();
    await expect(page.locator('.bd-hero')).toHaveCount(0);
    await save('02-open-result');
    await openBoard(page);
    await page.getByRole('button', { name: 'Request changes / continue' }).click();
    const message = page.getByRole('textbox', { name: 'Note to Architect' });
    await expect(message).toBeFocused();
    await message.fill(CHANGE);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => record()?.directives.some((item) => item.text === CHANGE)).toBe(true);
    await expect.poll(() => record()?.directives.find((item) => item.text === CHANGE)?.reply?.text).toContain('negative-limit');
    await expect.poll(() => record()?.working?.revision).toBe(2);
    expect(record()?.working?.criteria.some((criterion) => criterion.id === 'c2')).toBe(true);
    // This journey ends at a real subsequent request. Delivery of that next
    // repair is a separate outcome, not a requirement of result assessment.
    await save('03-change-request');
  } finally {
    fs.writeFileSync(path.join(EVIDENCE, 'stages.json'), JSON.stringify(stages, null, 2));
    if (check) {
      fs.writeFileSync(path.join(LOGS, 'app.log'), check.mainLog());
      await check.page.screenshot({ path: path.join(LOGS, 'final.png') }).catch(() => undefined);
      fs.writeFileSync(path.join(LOGS, 'final-record.json'), JSON.stringify(record(), null, 2));
      await check.close();
    }
  }
});
