/**
 * Coordinator-facing handlers for the Loop Catalog actions
 * (specs/14-loop-catalog.md). Kept out of coordinator.ts (500-LOC limit); the
 * coordinator delegates the catalog_* action kinds here.
 *
 * `catalog_install` is the whole install flow: validate the curated definition
 * exactly like a library load, land it as a provenance-linked library version
 * (reinstall = no-op), instantiate a draft in this workspace, then run the
 * planner over the draft with the curated definition as baseline so the model
 * adapts it to this workspace (asking only where genuinely ambiguous). Installs
 * NEVER auto-activate — activation stays the user's reviewed step.
 */

import { buildCatalogInstall } from '../shared/catalog';
import type { CatalogEntry } from '../shared/catalog-types';
import type {
  Loop,
  LoopLibraryLink,
  LoopWarning,
  OrchestratorAction,
  OrchestratorActionResult,
} from '../shared/types';
import { missingTools } from './delivery/availability';
import type { OrchestratorHost } from './host';
import { instantiate } from './library';
import { runPlanningFlow } from './planning-flow';
import { validateDeliverySettings, validateLoopPlan } from './schema';

export type CatalogAction = Extract<OrchestratorAction, { kind: `catalog_${string}` }>;

/** True for every `catalog_*` action — lets the coordinator route them in one line. */
export function isCatalogAction(action: OrchestratorAction): action is CatalogAction {
  return action.kind.startsWith('catalog_');
}

async function listAll(host: OrchestratorHost): Promise<OrchestratorActionResult> {
  const repos = await host.catalog.listRepos();
  const contents = await Promise.all(repos.map((r) => host.catalog.readContents(r.key)));
  return { ok: true, catalogRepos: repos, catalogContents: contents };
}

async function addRepo(host: OrchestratorHost, url: string): Promise<OrchestratorActionResult> {
  // The store throws on malformed/duplicate URLs; this is the action boundary,
  // so those become error results instead of tool-surface exceptions.
  try {
    await host.catalog.addRepo(url);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  host.log(`Added catalog repo ${url}`);
  return { ok: true, catalogRepos: await host.catalog.listRepos() };
}

async function removeRepo(host: OrchestratorHost, repoKey: string): Promise<OrchestratorActionResult> {
  try {
    await host.catalog.removeRepo(repoKey);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  host.log(`Removed catalog repo ${repoKey} (installed loops keep their library copies)`);
  return { ok: true, catalogRepos: await host.catalog.listRepos() };
}

async function refresh(host: OrchestratorHost, repoKey?: string): Promise<OrchestratorActionResult> {
  const repos = await host.catalog.listRepos();
  const targets = repoKey ? repos.filter((r) => r.key === repoKey) : repos;
  if (repoKey && targets.length === 0) return { ok: false, error: `Unknown catalog repo: ${repoKey}` };
  const outcomes: { key: string; stale: boolean; reason?: string }[] = [];
  for (const repo of targets) {
    const result = await host.catalog.refresh(repo.key);
    outcomes.push({ key: repo.key, stale: result.stale, reason: result.reason });
  }
  const contents = await Promise.all(repos.map((r) => host.catalog.readContents(r.key)));
  return { ok: true, catalogRefresh: outcomes, catalogRepos: await host.catalog.listRepos(), catalogContents: contents };
}

/** Appends the FR-C7 fail-soft warning when the entry's required tools are missing. */
async function withToolWarning(host: OrchestratorHost, loop: Loop, entry: CatalogEntry): Promise<Loop> {
  const missing = await missingTools(host, entry.meta.requiredTools ?? []);
  if (!missing || missing.length === 0) return loop;
  const warning: LoopWarning = {
    id: host.newId('warning'),
    code: 'catalog-tool-missing',
    message: `"${entry.meta.name}" expects the ${missing.map((t) => `"${t}"`).join(', ')} tool${missing.length === 1 ? '' : 's'}, which ${missing.length === 1 ? 'is' : 'are'} not available right now. You can still review and activate it; the affected steps will fail into recovery until the tool appears.`,
    createdAt: host.now(),
  };
  return { ...loop, warnings: [...loop.warnings, warning] };
}

async function install(
  host: OrchestratorHost,
  action: Extract<CatalogAction, { kind: 'catalog_install' }>,
): Promise<OrchestratorActionResult> {
  const catalogEntry = await host.catalog.readEntry(action.repoKey, action.slug);
  if (!catalogEntry) {
    return { ok: false, error: `Catalog entry not found: ${action.repoKey}/${action.slug} (try refreshing the catalog).` };
  }

  // Validate exactly like a library load BEFORE anything is written — a broken
  // catalog entry produces a clear error, never a half-installed library row.
  const definition = catalogEntry.definition;
  const planErrors = validateLoopPlan(definition.plan);
  const deliveryErrors = definition.delivery ? validateDeliverySettings(definition.delivery) : [];
  const errors = [...planErrors, ...deliveryErrors];
  if (errors.length > 0) {
    return { ok: false, error: `This catalog entry's definition is invalid: ${errors.join('; ')}` };
  }

  const index = await host.library.readIndex();
  const owned = index.entries.find((e) => e.catalog?.repoKey === action.repoKey && e.catalog?.slug === action.slug);
  const existing = owned ? await host.library.readEntry(owned.id) : null;
  const plan = buildCatalogInstall({ catalogEntry, existing, newEntryId: host.newId('libentry'), now: host.now() });
  if (plan.write) {
    await host.library.putVersion(plan.write.entry, plan.write.version);
    host.log(`Catalog ${action.repoKey}/${action.slug} v${catalogEntry.meta.version} → library ${plan.entryId} v${plan.libraryVersion}`);
  } else {
    host.log(`Catalog ${action.repoKey}/${action.slug} already installed as library ${plan.entryId} v${plan.libraryVersion}`);
  }
  if (action.workspaceLoad === false) return { ok: true };

  // Instantiate the draft, then let the planner adapt the curated definition to
  // this workspace (the definition rides along as baseline; clarifying
  // questions park on the draft through the normal human-input machinery).
  const link: LoopLibraryLink = { entryId: plan.entryId, version: plan.libraryVersion, syncedAt: host.now() };
  const draft = instantiate(host, definition, link);
  let loop = await runPlanningFlow(host, draft, { prompt: definition.prompt, baseline: definition });
  loop = await withToolWarning(host, loop, catalogEntry);
  await host.updateState((state) => ({ ...state, loops: [...state.loops, loop] }));
  host.log(`Installed catalog loop ${loop.id} from ${action.repoKey}/${action.slug} (status: ${loop.status})`);
  return { ok: true, loop };
}

export function handleCatalogAction(host: OrchestratorHost, action: CatalogAction): Promise<OrchestratorActionResult> {
  switch (action.kind) {
    case 'catalog_list':
      return listAll(host);
    case 'catalog_add_repo':
      return addRepo(host, action.url);
    case 'catalog_remove_repo':
      return removeRepo(host, action.repoKey);
    case 'catalog_refresh':
      return refresh(host, action.repoKey);
    case 'catalog_install':
      return install(host, action);
  }
}
