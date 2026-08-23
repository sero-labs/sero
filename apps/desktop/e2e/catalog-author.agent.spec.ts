/**
 * Official-catalog authoring harness (spec 14 phase 5) — NOT a regression test.
 *
 * Authors the official catalog's example loops THROUGH THE PRODUCT (the plan
 * says "authored via the product itself, not hand-written JSON"): for each
 * recipe it drives create (real planner) → optional tweaks (per-step model,
 * loop context) → library_save → exports the saved SharedLoopDefinition into
 * a catalog repo checkout, then cleans the loop and library entry up again.
 *
 * Run manually against the real app:
 *   pnpm build   (repo root — plugin UI/runtime are their own build)
 *   SERO_E2E_REAL_HOME=1 SERO_E2E_CATALOG_AUTHOR=1 \
 *   SERO_CATALOG_OUT=/path/to/orchestrator-catalog \
 *     npx playwright test e2e/catalog-author.agent.spec.ts --project=agent
 *
 * Curated metadata (loops/<slug>/catalog.json) and example outputs are written
 * by hand in the catalog repo afterwards — this harness only produces honest,
 * runnable definitions.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, workspace as workspaceSel } from './helpers';
import { waitForShell, createWorkspaceDir } from './helpers/workflow';

const ENABLED = process.env.SERO_E2E_CATALOG_AUTHOR === '1' && process.env.SERO_E2E_REAL_HOME === '1';
const OUT_DIR = process.env.SERO_CATALOG_OUT ?? '';

let app: ElectronApplication;
let page: Page;
let wsDir: string;
let wsId: string;
let libraryDir: string;

interface TriggerLite {
  type: string;
  schedule?: string;
  eventSource?: string;
  maxFires?: number;
}

interface LoopLite {
  id: string;
  title: string;
  status: string;
  triggers: TriggerLite[];
  plan: { steps: { id: string; execution: { type: string } }[] };
  runtime: { pendingInput?: { questions: { prompt: string }[] } };
  libraryLink?: { entryId: string; version: number };
}

interface Recipe {
  slug: string;
  name: string;
  prompt: string;
  create: Record<string, unknown>;
  /** Human-readable trigger expectation, checked against the authored loop. */
  wantTrigger: (triggers: TriggerLite[]) => boolean;
  /** Per-step model tiers to apply before saving: 'all' or the first N steps. */
  tiers?: { scope: 'all' | 'first'; model: 'LOW' | 'MED' | 'HIGH' };
  contextOverrides?: Record<string, unknown>;
}

const RECIPES: Recipe[] = [
  {
    slug: 'daily-note',
    name: 'Daily note',
    prompt:
      'Every weekday at 8am, write a short daily note into notes/daily/ named after today\'s date. Cover: what changed in the project since the last note (use git history when available, otherwise file timestamps), anything that looks unfinished, and one suggested focus for today. Keep it under 15 lines of plain language.',
    create: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true, deliveryDestination: 'workspace-files' },
    wantTrigger: (t) => t.some((x) => (x.type === 'cron' || x.type === 'hybrid') && !!x.schedule && !x.maxFires),
    tiers: { scope: 'all', model: 'LOW' },
  },
  {
    slug: 'weekly-research-digest',
    name: 'Weekly research digest',
    prompt:
      "Every Monday at 9am, produce a research digest for this project: identify the project's domain and main technologies from its files, find what changed or was announced in that space over the past week, pick the three most relevant items, and write a short digest explaining why each one matters to this project.",
    create: {
      useManagedWorktree: false,
      allowDirtyWorkspaceRoot: true,
      deliveryDestination: 'saved-artifact',
      deliveryParamsJson: '{"name":"weekly-digest"}',
    },
    wantTrigger: (t) => t.some((x) => (x.type === 'cron' || x.type === 'hybrid') && !!x.schedule && !x.maxFires),
    tiers: { scope: 'first', model: 'LOW' },
  },
  {
    slug: 'repo-hygiene-monitor',
    name: 'Repo hygiene monitor',
    prompt:
      'Whenever files in this project change, review the changed files for hygiene problems: leftover debug output, commented-out code blocks, TODO or FIXME notes without an owner, and source files over 500 lines. Append any new findings to HYGIENE.md with the date. If there is nothing new to report, finish the pass without changing anything.',
    create: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true, deliveryDestination: 'workspace-files' },
    wantTrigger: (t) => t.some((x) => x.eventSource === 'fs:changed' && !x.maxFires),
  },
  {
    slug: 'ci-fixer',
    name: 'CI fixer',
    prompt:
      "Whenever a CI run fails on a pull request branch in this repository, fix that failure: read the failed run's logs with gh, find the root cause, make the smallest fix that addresses it, run the checks that failed to confirm they now pass, and push the fix so the pull request updates. Only act when the failing branch belongs to an open pull request that I authored or that Sero created; ignore failures on other branches.",
    create: { useManagedWorktree: true, worktreeBranchSource: 'event-pr', deliveryDestination: 'pr' },
    wantTrigger: (t) => t.some((x) => x.eventSource === 'github:ci-failed' && !x.maxFires),
  },
  {
    slug: 'review-responder',
    name: 'Review responder',
    prompt:
      'Whenever a review comment is posted on one of my open pull requests by someone other than me, respond to that review: read the full review thread and the pull request diff, work through every unaddressed comment — apply the requested change when it is right, answer it when it is a question, or explain briefly why you disagree — verify the project still passes its checks after any changes, push, and reply to each comment on the pull request with what was done. Comments that arrive close together should be handled as one batch.',
    create: { useManagedWorktree: true, worktreeBranchSource: 'event-pr', deliveryDestination: 'pr' },
    wantTrigger: (t) => t.some((x) => x.eventSource === 'github:review-comment' && !x.maxFires),
  },
  {
    slug: 'rebase-on-main',
    name: 'Rebase on main',
    prompt:
      'Whenever the main branch of this repository is updated, bring my open pull requests up to date: list the open pull requests that I authored or that Sero created, and for each one that is behind main, rebase it onto the latest main (or merge main in when rebasing is unsafe), resolve conflicts only when the resolution is obvious, run the project checks, and push the updated branch. Leave any pull request whose conflicts are not clearly resolvable untouched and describe the conflict in a comment on that pull request instead. Wait at least fifteen minutes after the last main update before starting so a burst of pushes is handled once.',
    create: { useManagedWorktree: true, deliveryDestination: 'pr' },
    wantTrigger: (t) => t.some((x) => x.eventSource === 'github:main-updated' && !x.maxFires),
  },
  {
    slug: 'issue-implementer',
    name: 'Issue implementer',
    prompt:
      'Every two hours, and whenever a new issue is opened in this repository, work the issue backlog. First scan: list open unassigned issues and exclude any that already have an open pull request linked, a human assignee, or a recent Sero claim comment (a "Sero started work on this issue" marker posted within the last day — older markers with no linked pull request count as expired). Judge the remaining candidates on clarity, size, risk, and value, and pick the single best one — or, if none is suitable, finish the pass reporting that plainly without claiming completion of any delivery. Before writing any code, claim the chosen issue: assign it to me and post the comment "Sero started work on this issue" with the current time; then re-read the issue, and if someone else is now also assigned or posted an earlier active claim, remove my assignment and finish the pass as skipped. Once the claim is verified, decide the approach: implement directly when the issue is small and clear; write a short implementation plan first when it is substantial; when it is too vague, post concrete clarifying questions on the issue, remove my assignment, and finish the pass; when it needs a product decision or is too large for one change, comment why with a suggested breakdown, remove my assignment, and finish the pass. When implementing: make the change, add or update tests and documentation where they apply, run the project checks, and open a pull request whose description includes "Closes #<issue number>"; then comment the pull request link on the issue. Handle exactly one issue per pass and never merge pull requests.',
    create: { useManagedWorktree: true, deliveryDestination: 'pr' },
    wantTrigger: (t) =>
      t.some((x) => (x.type === 'cron' || x.type === 'hybrid') && !!x.schedule && !x.maxFires) &&
      t.some((x) => x.eventSource === 'github:issue-opened' && !x.maxFires),
  },
  {
    slug: 'issue-triage-report',
    name: 'Issue triage & report',
    prompt:
      'Whenever an issue in this repository is labelled triage, investigate it: try to reproduce the problem, locate the code involved, judge severity and likely effort, and send a short triage report for the team.',
    create: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true, deliveryDestination: 'webhook-post' },
    wantTrigger: (t) => t.some((x) => x.eventSource === 'github:issue-labelled' && !x.maxFires),
  },
  {
    slug: 'inbox-to-brief',
    name: 'Inbox to brief',
    prompt:
      'Every morning at 7:30, and also whenever a new file appears in the requests folder of this project, assemble a morning brief: summarize any new requests, report project status from recent changes, list anything time-sensitive, and finish with a prioritized to-do list for today. Draft the brief as an email for my review.',
    create: { useManagedWorktree: false, allowDirtyWorkspaceRoot: true, deliveryDestination: 'email-draft' },
    wantTrigger: (t) => t.some((x) => x.type === 'hybrid' && !!x.schedule && x.eventSource === 'fs:changed' && !x.maxFires),
    contextOverrides: {
      systemPrompt: 'Write briefs in crisp bullet points. Lead with whatever needs a decision today. Never exceed 200 words.',
    },
  },
];

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function findRegisteredWorkspace(seroHome: string): { id: string; path: string } | null {
  const profilesDir = path.join(seroHome, 'profiles');
  const profileNames = fs.existsSync(profilesDir) ? fs.readdirSync(profilesDir) : [];
  const registries = [
    ...profileNames.map((name) => path.join(profilesDir, name, 'agent', 'workspaces.json')),
    path.join(seroHome, 'agent', 'workspaces.json'),
  ];
  for (const registry of registries) {
    const parsed = readJson<{ workspaces?: { id: string; path: string }[] }>(registry);
    for (const entry of parsed?.workspaces ?? []) {
      if (entry?.path?.includes('catalog-author') && fs.existsSync(entry.path)) return entry;
    }
  }
  return null;
}

/** Runs one orchestrator action through the same seam the UI uses. */
async function invoke(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await page.evaluate(
    ({ workspaceId, toolParams }) =>
      window.sero.appAgent.invokeTool('orchestrator', workspaceId, 'orchestrator', toolParams),
    { workspaceId: wsId, toolParams: params },
  );
  return ((result as { details?: Record<string, unknown> })?.details ?? {}) as Record<string, unknown>;
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'authoring harness — run with SERO_E2E_REAL_HOME=1 SERO_E2E_CATALOG_AUTHOR=1');

test.beforeAll(async () => {
  test.setTimeout(120_000);
  expect(OUT_DIR, 'SERO_CATALOG_OUT must point at an orchestrator-catalog checkout').toBeTruthy();
  expect(fs.existsSync(path.join(OUT_DIR, 'catalog.json'))).toBe(true);

  const seroHome = path.join(os.homedir(), '.sero-ui');
  const existing = findRegisteredWorkspace(seroHome);
  if (existing) {
    wsDir = existing.path;
    wsId = existing.id;
    fs.rmSync(path.join(wsDir, '.sero'), { recursive: true, force: true });
  } else {
    wsDir = createWorkspaceDir(path.join(seroHome, 'workspaces'), `catalog-author-${Date.now()}`, {
      'README.md': [
        '# Catalog authoring scratch project',
        '',
        'A tiny pretend TypeScript service: a request parser, a report formatter, and a CLI.',
        'Recent work: fixed the date parser, added CSV export, sped up startup.',
      ].join('\n'),
    });
    wsId = '';
  }

  ({ app, page } = await launchSeroApp({ seroHome, runtime: 'host', env: {} }));
  await waitForShell(page);

  if (!wsId) {
    const ws = await page.evaluate(async ({ folderPath, name }) => {
      const created = await window.sero.workspace.addFolder(folderPath, name);
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return created;
    }, { folderPath: wsDir, name: 'Catalog authoring' });
    wsId = ws.id;
  }
  await page.locator(workspaceSel.nodeById(wsId)).click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);

  const listed = await invoke({ action: 'library_list' });
  libraryDir = String(listed.libraryDir ?? '');
  expect(libraryDir).toBeTruthy();
});

test.afterAll(async () => {
  await closeSeroApp(app);
});

for (const recipe of RECIPES) {
  test(`author ${recipe.slug}`, async () => {
    test.setTimeout(600_000);

    // Idempotent reruns: an already-exported definition is kept (delete the
    // file in the checkout to re-author an entry).
    const defFile = path.join(OUT_DIR, 'loops', recipe.slug, 'definition.json');
    test.skip(fs.existsSync(defFile), `${recipe.slug} already exported`);

    const created = await invoke({ action: 'create', prompt: recipe.prompt, title: recipe.name, ...recipe.create });
    expect(created.ok, String(created.error ?? '')).not.toBe(false);
    const loop = created.loop as LoopLite;

    // The prompt must be self-sufficient: a parked clarifying question means
    // the recipe needs rewording, so fail loudly with the question.
    expect(
      loop.runtime.pendingInput?.questions.map((q) => q.prompt).join(' | ') ?? '',
      'planner asked a clarifying question — make the recipe prompt self-sufficient',
    ).toBe('');
    expect(loop.status, 'plan must validate (draft, not blocked)').toBe('draft');
    expect(recipe.wantTrigger(loop.triggers), `triggers off: ${JSON.stringify(loop.triggers)}`).toBe(true);

    if (recipe.tiers) {
      const steps = loop.plan.steps.filter((s) => s.execution.type === 'background-agent' || s.execution.type === 'model');
      const targets = recipe.tiers.scope === 'all' ? steps : steps.slice(0, 1);
      expect(targets, `${recipe.slug} produced no model or background-agent steps`).not.toHaveLength(0);
      for (const step of targets) {
        const res = await invoke({ action: 'set_step_model', loopId: loop.id, stepId: step.id, model: recipe.tiers.model });
        expect(res.ok).not.toBe(false);
      }
    }
    if (recipe.contextOverrides) {
      const res = await invoke({ action: 'set_loop_context', loopId: loop.id, contextJson: JSON.stringify(recipe.contextOverrides) });
      expect(res.ok).not.toBe(false);
    }

    const saved = await invoke({ action: 'library_save', loopId: loop.id, mode: 'new-entry', name: recipe.name });
    expect(saved.ok, String(saved.error ?? '')).not.toBe(false);
    const link = (saved.loop as LoopLite).libraryLink!;
    const version = readJson<{ definition: Record<string, unknown> }>(
      path.join(libraryDir, 'entries', link.entryId, 'versions', `${link.version}.json`),
    );
    expect(version?.definition).toBeTruthy();

    const entryDir = path.join(OUT_DIR, 'loops', recipe.slug);
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(path.join(entryDir, 'definition.json'), `${JSON.stringify(version!.definition, null, 2)}\n`);

    // Leave Dan's real profile the way we found it.
    await invoke({ action: 'delete', loopId: loop.id });
    await invoke({ action: 'library_delete', entryId: link.entryId });
  });
}
