/**
 * The site pass (design decision 4): at every call site, read the tools the
 * session is given and run each once with its first scenario step. What
 * differs between sites is wiring, so one call per tool is enough to catch it.
 */
import type { ToolCheckApp } from './app';
import { AFTER_FAILED_CALL, codemodeIdentifier, unwrapScriptResult } from './codemode-call';
import type { RunOutcome, RunStep, StepRoute } from './driver';
import { runInChat, type ChatRun } from './sites';
import { runInSubagent } from './subagent-site';
import { routeTo, siteToolNames, type SessionSurface } from './surface';
import { REJECTS } from './ledger';
import type { StepParams, ToolCallResult, ToolCheckFixtures, ToolCheckSite, ToolProbe } from './types';
import { runInWorkflowWorker } from './workflow-worker';

/** Where a site's tools came from: the session's own list, and for a script the session that runs it. */
export interface SiteSurface {
  site: ToolCheckSite;
  /** The tools as the inventory names them. */
  tools: string[];
  /** How the session reaches each tool. */
  route: (tool: string) => StepRoute | null;
}

/** A Code Mode site runs inside a chat or a subagent; the rest are sessions of their own. */
const CODEMODE_PARENT: Partial<Record<ToolCheckSite, ToolCheckSite>> = {
  'codemode-chat': 'chat',
  'codemode-subagent': 'subagent',
};

/** Opens the site with one step, or none, in a session of its own. */
export function runAt(check: ToolCheckApp, site: ToolCheckSite, run: ChatRun): Promise<RunOutcome & { surface?: SessionSurface }> {
  switch (site) {
    case 'chat':
    case 'codemode-chat':
      return runInChat(check, run, site);
    case 'subagent':
    case 'codemode-subagent':
      return runInSubagent(check, run, site);
    case 'workflow-worker':
      return runInWorkflowWorker(check, { ...run, defaultTools: true });
    default:
      throw new Error(`no runner for the ${site} site yet`);
  }
}

/** Core commands, from the probe table: `sero <command>`. */
function coreCommands(probes: ToolProbe[]): Set<string> {
  return new Set(probes.filter((probe) => probe.tool.startsWith('sero ')).map((probe) => probe.tool.slice('sero '.length)));
}

/** A session site's tools, as its first request to the stub listed them. */
export function sessionSurface(site: ToolCheckSite, surface: SessionSurface, probes: ToolProbe[]): SiteSurface {
  return {
    site,
    tools: siteToolNames(surface, coreCommands(probes)),
    route: (tool) => routeTo(surface, tool),
  };
}

/**
 * A Code Mode site's tools: what a script started from the parent session can
 * call (`ALL_TOOLS`), plus the commands its `sero-cli` reaches. Read by
 * running a script there.
 */
export async function readCodemodeSurface(
  check: ToolCheckApp,
  site: ToolCheckSite,
  parent: SessionSurface,
  probes: ToolProbe[],
  fixtures: ToolCheckFixtures,
): Promise<SiteSurface> {
  const parentSite = CODEMODE_PARENT[site];
  if (!parentSite) throw new Error(`${site} is not a Code Mode site`);
  const callable: string[] = [];
  const outcome = await runAt(check, parentSite, {
    tool: 'codemode',
    via: 'direct',
    fixtures,
    label: `${site} surface`,
    steps: [{
      action: null,
      params: { code: 'return ALL_TOOLS.map((tool) => tool.name);' },
      expect(result) {
        const names = JSON.parse(unwrapScriptResult(result).text) as string[];
        callable.push(...names);
      },
    }],
  });
  if (outcome.failure) throw new Error(`could not read what a script can call at ${site}: ${outcome.failure}`);
  // A script names tools by identifier; map each back to the tool's own name.
  const byIdentifier = new Map([...parent.tools, ...probes.map((probe) => probe.tool)].map((name) => [codemodeIdentifier(name), name]));
  const tools = callable.map((name) => byIdentifier.get(name) ?? name);
  const surface: SessionSurface = { tools, commands: parent.commands };
  return {
    site,
    tools: siteToolNames(surface, coreCommands(probes)),
    route(tool) {
      const route = routeTo(surface, tool);
      if (route === null) return null;
      return route === 'direct' ? 'codemode' : 'codemode-cli';
    },
  };
}

/** One step per tool the site was given: its site step, or else its first scenario step that is not exempt. */
export function sitePassSteps(surface: SiteSurface, probes: ToolProbe[]): { steps: RunStep[]; missing: string[] } {
  const steps: RunStep[] = [];
  const missing: string[] = [];
  // In table order, so a tool that reads what another left (get_search_content after fetch_content) runs after it.
  const known = new Set(probes.map((probe) => probe.tool));
  const ordered = [...probes.map((probe) => probe.tool).filter((tool) => surface.tools.includes(tool)), ...surface.tools.filter((tool) => !known.has(tool))];
  for (const tool of ordered) {
    const probe = probes.find((entry) => entry.tool === tool);
    const exempt = new Set((probe?.exemptions ?? []).map((exemption) => exemption.action));
    const step = probe?.siteStep ?? probe?.steps.find((candidate) => !exempt.has(candidate.action));
    const via = surface.route(tool);
    // A fully exempt tool has no step to run; the ledger check allows for it.
    if (!step && probe?.exemptions?.length) continue;
    if (!step || !via) {
      missing.push(tool);
      continue;
    }
    steps.push({ ...step, tool, via });
  }
  return { steps, missing };
}

/** A call that must fail: a missing argument, or an action or subcommand that does not exist. */
function failingParams(probe: ToolProbe): StepParams | null {
  if (probe.failingCall !== undefined) return probe.failingCall;
  const hasActions = probe.steps.some((step) => step.action !== null);
  if (probe.tool.startsWith('sero ')) return { argv: hasActions ? ['tc-no-such-subcommand'] : [] };
  return hasActions ? { action: 'tc-no-such-action' } : {};
}

function expectRejected(result: ToolCallResult): void {
  if (result.isError !== true || result.text.includes(AFTER_FAILED_CALL)) {
    throw new Error(`the failing call resolved and the script went on: ${result.text.slice(0, 300)}`);
  }
}

/** At a Code Mode site, one failing call per tool, which must reject and stop the script. */
export function rejectionSteps(surface: SiteSurface, probes: ToolProbe[]): RunStep[] {
  return surface.tools.flatMap((tool) => {
    const probe = probes.find((entry) => entry.tool === tool);
    const via = surface.route(tool);
    const params = probe ? failingParams(probe) : null;
    if (!probe || !via || !params) return [];
    return [{ tool, via, rejects: true, action: REJECTS, params, expect: expectRejected }];
  });
}
