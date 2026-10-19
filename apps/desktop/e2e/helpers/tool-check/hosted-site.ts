/**
 * The site pass at a session another probe's run drives: a Room member or a
 * project's owner. Its tools show only once the session starts, and it works
 * in its own folder (a member's worktree, the project's folder), so the steps
 * are chosen from its first request and check their effects there.
 */
import { cliCommandsListed } from '../session-probe';
import type { StubRequest } from '../stub-model';
import type { ToolCheckApp } from './app';
import type { RunStep } from './driver';
import { cancelStep, type Stop } from './hosted-cancel';
import { sessionSurface, sitePassSteps } from './site-pass';
import { TOOL_PROBES } from './table';
import type { StepContext, ToolCheckSite } from './types';

/** A session's working folder, from the `<cwd>` section Pi puts in its system prompt. */
export function cwdOf(request: StubRequest): string {
  const folder = /<cwd>\n([^\n]+)\n<\/cwd>/.exec(request.system)?.[1];
  if (!folder) throw new Error('the session prompt does not name its working folder');
  return folder;
}

/** The step, checking its effects in `folder` instead of the workspace. */
function inFolder(step: RunStep, folder: string): RunStep {
  const at = (ctx: StepContext): StepContext => ({ ...ctx, workspacePath: folder });
  const { params, setup, expect } = step;
  return {
    ...step,
    params: typeof params === 'function' ? (ctx) => params(at(ctx)) : params,
    ...(setup ? { setup: (ctx: StepContext) => setup(at(ctx)) } : {}),
    expect: (result, ctx) => expect(result, at(ctx)),
  };
}

/**
 * Chooses a hosted session's steps: one site-pass step for each tool it was
 * given, apart from the run's own tool, whose steps already run there, and a
 * cancelled long command where it was given `bash`.
 */
export function hostedSitePass(check: ToolCheckApp, site: ToolCheckSite, ownTool: string, order: 'before' | 'after', stop: Stop) {
  return (request: StubRequest, planned: RunStep[]): RunStep[] => {
    const given = { tools: request.tools.map((tool) => tool.name), commands: cliCommandsListed(request.system) };
    const surface = sessionSurface(site, given, TOOL_PROBES);
    check.ledger.siteTools(site, surface.tools);
    const folder = cwdOf(request);
    const { steps, missing } = sitePassSteps(surface, TOOL_PROBES);
    if (missing.length) console.log(`${site} was given tools with no step to run: ${missing.join(', ')}`);
    const pass = steps.filter((step) => step.tool !== ownTool).map((step) => inFolder(step, folder));
    if (surface.tools.includes('bash')) pass.push(inFolder(cancelStep(stop), folder));
    return order === 'before' ? [...pass, ...planned] : [...planned, ...pass];
  };
}
