import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { ProjectRecord } from '../../../plugins/sero-architect-plugin/shared/record';
import { startToolCheckApp, type ToolCheckApp } from './helpers/tool-check/app';
import { cliCall, identityText, runTurn, userMessages, type ScriptedCall } from './helpers/tool-check/probes/session-script';
import { architectWorkResponder } from './helpers/tool-check/probes/architect-stub';
import type { StubRequest, StubReply } from './helpers/stub-model';

const EVIDENCE = path.resolve(__dirname, 'screenshots/onboarding-starter-632');
const LOGS = '/private/tmp/sero-v1-tools/632-logs';
const RESULT = 'The sample helper now fits the limit and its unchanged check passes.';
let app: ToolCheckApp;
const turns = new Map<number, 'repair' | 'accept' | 'idle'>();

function record(): ProjectRecord | null {
  if (!app) return null;
  const folder = path.join(app.homePath, '.sero-ui/profiles/tool-check/apps/architect/projects');
  const file = fs.existsSync(folder) ? fs.readdirSync(folder).find((name) => name.endsWith('.json')) : undefined;
  return file ? JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')) : null;
}

function responder(request: StubRequest): StubReply | undefined {
  if (!identityText(request).includes('You are the owner of Architect project')) return architectWorkResponder(request);
  const saved = record();
  if (!saved) throw new Error('Owner started without a saved sample project');
  const turn = userMessages(request).length;
  const step = saved.milestones.find((item) => item.id === 'm1');
  if (!turns.has(turn)) turns.set(turn, !step ? 'repair' : step.evidence?.passed && step.status !== 'done' ? 'accept' : 'idle');
  const owner = (action: string, extra: Record<string, unknown> = {}) => cliCall('architect', { action, projectId: saved.id, ...extra });
  const calls: ScriptedCall[] = [];
  if (turns.get(turn) === 'repair') calls.push(
    owner('working', { objective: saved.idea, approach: 'Repair the helper and run its existing check.', criteriaJson: JSON.stringify([{ id: 'c1', text: 'Truncation fits nonnegative limits and short text is unchanged.', userStated: true }]) }),
    owner('milestone', { title: 'Repair the sample helper', plan: 'Edit truncate.cjs and run node --test repair.test.cjs.' }),
    owner('work', { operation: 'begin', milestoneId: 'm1' }),
    { name: 'write', arguments: { path: path.join(saved.folder, 'truncate.cjs'), content: "module.exports = (text, max) => text.length > max ? text.slice(0, Math.max(0, max - 3)) + '.'.repeat(Math.min(3, max)) : text;\n" } },
    owner('work', { operation: 'report', executionId: step?.direct?.id ?? '', text: 'Repaired the helper.', destination: 'workspace-files' }),
    owner('evidence', { milestoneId: 'm1', commandsJson: JSON.stringify(['node --test repair.test.cjs']), criteria: 'c1' }),
    owner('sleep'),
  );
  else if (turns.get(turn) === 'accept') calls.push(owner('milestone', { milestoneId: 'm1', done: true }), owner('summary', { field: 'result', text: RESULT, sourceKind: 'milestone', sourceId: 'm1' }), owner('sleep'));
  else calls.push(owner('sleep'));
  return runTurn(request, calls, 'Waiting for the next event.');
}

test('launch the disclosed starter and inspect its real checked repair', async () => {
  test.setTimeout(360_000);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  const stages: string[] = [];
  const save = async (name: string) => { await app.page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) }); stages.push(name); };
  try {
    app = await startToolCheckApp({ override: responder });
    const page = app.page;
    await page.evaluate(() => window.sero.appControl.open('dashboard'));
    await page.getByRole('button', { name: 'Try a sample repair', exact: true }).click();
    const card = page.getByRole('region', { name: 'Sample repair', exact: true });
    await expect(card).toContainText('$5');
    await expect(card).toContainText('Node.js and Git');
    await save('01-disclosure');
    await card.getByRole('button', { name: 'Prepare sample and approve access', exact: true }).click();
    await page.getByRole('region', { name: 'Pending requests' }).getByRole('button', { name: 'Allow', exact: true }).click({ timeout: 120_000 });
    const result = page.getByRole('region', { name: 'Result', exact: true });
    await expect(result).toContainText(RESULT, { timeout: 180_000 });
    await expect.poll(() => record()?.milestones.find((item) => item.id === 'm1')?.verification).toBe('delivered');
    const saved = record()!;
    const diff = execFileSync('git', ['diff', '--', 'truncate.cjs'], { cwd: saved.folder, encoding: 'utf8' });
    expect(diff).toContain('+module.exports');
    expect(execFileSync('git', ['diff', '--', 'repair.test.cjs'], { cwd: saved.folder, encoding: 'utf8' })).toBe('');
    await result.locator('summary').filter({ hasText: 'Evidence at' }).click();
    await expect(result).toContainText('node --test repair.test.cjs');
    await save('02-checked-result');
    await result.getByRole('button', { name: 'Open Git changes', exact: true }).click();
    await expect(page.locator('.bd-hero')).toHaveCount(0);
    await save('03-git-changes');
    await page.evaluate(async (id) => {
      globalThis.__sero_app_launch_params__ ??= new Map();
      globalThis.__sero_app_launch_params__.set('architect', { projectId: id });
      await window.sero.appControl.open('architect');
      window.dispatchEvent(new CustomEvent('sero:app-launch:architect', { detail: { projectId: id } }));
    }, saved.id);
    await page.getByRole('region', { name: 'Result', exact: true }).getByRole('button', { name: 'Open result', exact: true }).click();
    await expect(page.locator('.bd-hero')).toHaveCount(0);
    await save('04-open-result');
    fs.writeFileSync(path.join(LOGS, 'repair.diff'), diff);
  } finally {
    fs.writeFileSync(path.join(EVIDENCE, 'stages.json'), JSON.stringify(stages, null, 2));
    if (app) {
      fs.writeFileSync(path.join(LOGS, 'app.log'), app.mainLog());
      fs.writeFileSync(path.join(LOGS, 'record.json'), JSON.stringify(record(), null, 2));
      await app.page.screenshot({ path: path.join(LOGS, 'final.png') }).catch(() => undefined);
      await app.close();
    }
  }
});
