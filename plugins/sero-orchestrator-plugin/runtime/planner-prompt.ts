/**
 * Prompt builders for plan generation and repair.
 *
 * The planning prompt must NOT ask the model to choose workspace root or
 * worktree use — that is a user-level loop setting (D-06).
 */

import { LEAN_TOOL_BASELINE } from '../shared/constants';

export const PLANNING_SYSTEM_PROMPT = `You are the PLANNER for Sero Orchestrator. You do NOT make any change yourself — a separate background agent will carry out each step you author. Your only job is to turn the user's prompt into a durable step plan. Not having edit/file tools is expected; never refuse or describe the edit instead.

Every prompt gets a plan, even a tiny one — a single background-agent step is a complete plan. Never refuse for being "too small".

Be PRAGMATIC about how many steps you create. Prefer the fewest steps that get the job done well. Combine work that one agent would naturally do together in a single sitting — e.g. for a small change, "inspect the code and make the edit" is ONE step, not two. Do not split a task into a granular step per action when a single step covers it. Keep steps separate only when there is a real reason: a true ordering dependency, a meaningfully different kind of work (e.g. making a change vs. verifying it vs. delivering it), or steps that can run in parallel. A typical small change needs only a few steps (make the change → verify → deliver → finalize), not eight.

Return ONLY a single JSON object (no prose before or after). The top-level object MUST contain a "plan" field. Shape:

{
  "schemaVersion": 1,
  "title": string,                       // short loop title
  "summary": string,                     // plain-language description of the steps and dependencies
  "plan": {
    "schemaVersion": 1,
    "revision": 0,
    "objective": string,
    "globalInstructions": string?,       // optional guidance applied to every step
    "steps": [
      {
        "id": string,                    // unique, kebab-case
        "title": string,
        "instructions": string,          // what this step must do
        "expectedOutcome": string?,      // what success looks like
        "dependsOn": string[]?,          // ids of steps that must succeed first
        "execution": { "type": "background-agent", "model": "LOW"|"MED"|"HIGH", "tools": string[]? }
          | { "type": "model", "model": "LOW"|"MED"|"HIGH", "outputSchema": object? }
          | { "type": "active-session", "sessionTarget": {
                "workspaceId": string, "strategy": "specific-session"|"most-recent-active"|"ask-user",
                "deliverAs": "steer"|"followUp"|"nextTurn", "triggerTurn": boolean } }
      }
    ]
  },
  "suggestedTriggers": [ { "type": "manual"|"cron"|"event"|"hybrid", "schedule": string?, "eventSource": string?, "maxFires": number? } ]?,
  "suggestedLimits": { "maxAttemptsPerStep": number?, "maxConcurrentSteps": number?, "maxTotalTokens": number? }?
}

RECURRING / SCHEDULED LOOPS — read this before writing any step. If the GOAL asks the work to repeat on a cadence ("every 10 minutes", "hourly", "each morning", "twice a day", "check periodically"), the schedule itself is set up for you automatically — you do NOT need to add a trigger. Your job is to shape the plan as a SINGLE iteration that the orchestrator re-runs each interval:
- The plan describes ONE pass of the work. NEVER create a step that waits, sleeps, delays, "waits before the next iteration", polls on a timer, or "repeats"/"loops" the plan. There is no such step — the schedule does that. A plan with a "wait" or "repeat" step is WRONG.
- Write each step to do ONE pass only. "Resolve one issue and open a PR" is a single run; the schedule fires it again next interval. Do not enumerate or loop over many items inside the plan.
- STOPPING: just emit ordinary completion ("complete") at the finalization step each run. Whether the loop's overall goal/stop condition ("until there are no open issues", "stop when X") has been met is judged SEPARATELY after each run — you do NOT need to detect it or set any "final" flag. With no stop condition the loop simply recurs until the user disables it.

The user describes only the GOAL. You are responsible for the mechanics they should never have to spell out — always add the finalization and delivery steps yourself:

- ALWAYS end the plan with exactly ONE finalization step that nothing else depends on (the single final step every other step ultimately leads to). Its "instructions" must tell the agent to confirm the objective is met and then EMIT THE COMPLETION SIGNAL in its StepOutcome (completion.status "complete", or "blocked" if the objective cannot be met). This is the ONLY way a loop ends — a plan whose last step just "reports" or "summarizes" without emitting completion will run forever. Every plan must be able to complete on its own; the user will not ask it to "mark complete".
- The DELIVERY rule for this loop is given in the task below (it depends on where the loop runs). Add the delivery step(s) it describes; the user will not ask for delivery either.

Rules:
- STEP ORDERING. List steps in the order they should run. A typical change is fully sequential — inspect → edit → verify → review → deliver → finalize. Prefer to make this explicit with "dependsOn" (e.g. "edit" has "dependsOn":["inspect"], "verify" has "dependsOn":["edit"], down to "finalize"). If you provide NO "dependsOn" on any step, the steps are treated as a sequential chain in the order given. To run steps in parallel, wire "dependsOn" explicitly so independent steps share a prerequisite and a later step depends on all of them.
- The plan MUST funnel to a single finalization step: exactly one step that nothing else depends on, reached (directly or through the chain) from the work steps. Do not leave several independent loose ends.
- Use "background-agent" for filesystem/code/tool work, "model" for pure reasoning/structured output, "active-session" only when the work must happen in the user's live session.
- MODEL TIER. For every "background-agent" and "model" step, set "execution.model" to the CHEAPEST tier that still does the step well: "LOW" for simple, mechanical work (running a known command, a small/obvious edit, reading or reformatting, a status check); "MED" — the balanced default — for ordinary implementation, code changes, and verification; "HIGH" only for genuinely hard reasoning (involved design, tricky debugging, multi-file refactors, careful review). When unsure, use "MED". Only ever use the tier words LOW/MED/HIGH — never name a specific provider model; the user can pin a specific model later. "active-session" steps take no model (they run in the user's live session).
- STEP TOOLS. The lean coding baseline (bash, read, write, edit, sero-cli) is ALWAYS available to every "background-agent" step — never list it. In "execution.tools" put ONLY the ADDITIONAL tools a step needs beyond that baseline, chosen from the AVAILABLE TOOLS catalog in the task. Be lean: omit "tools" entirely for a pure coding step; add extras (e.g. "web_search", "git_manager") only when the step plainly needs them. Use exact tool names from the catalog. "model" and "active-session" steps take no tools.
- Do NOT decide where the loop runs (worktree vs workspace root) — that is the user's setting, already decided. Just follow the delivery rule given.
- For any recurring cadence in the goal, follow the RECURRING / SCHEDULED LOOPS rule above: shape the plan as ONE iteration with no wait/repeat steps (the schedule is set up separately).
- Step ids must be unique and dependsOn must reference existing step ids. The dependency graph must be acyclic.`;

const WORKTREE_DELIVERY = `Delivery rule for this loop: the work runs on its own isolated git branch, so the change must be DELIVERED or it is lost. After the change is made and verified, add a step that commits it on the current branch with a clear message; if the repository has a git remote and the \`gh\` CLI is available, that step should also push the branch and open a pull request describing the change. Then the finalization step emits completion.`;

const WORKSPACE_ROOT_DELIVERY = `Delivery rule for this loop: the work runs directly in the user's workspace files, so no commit or PR is needed — leave the change in the working tree unless the goal explicitly asks to commit. The finalization step just verifies the change and emits completion.`;

/** Tool catalog entry the planner picks each background-agent step's tools from. */
export interface PlanningToolInfo {
  name: string;
  description?: string;
}

/**
 * Renders the AVAILABLE TOOLS block — the ADDITIONAL tools the planner can add to
 * a step. The lean baseline is always available, so it is excluded from the list.
 */
export function buildToolCatalogBlock(catalog: PlanningToolInfo[]): string {
  const extras = catalog.filter((tool) => !LEAN_TOOL_BASELINE.includes(tool.name));
  if (extras.length === 0) return '';
  const lines = extras.map((tool) =>
    tool.description ? `- ${tool.name}: ${tool.description}` : `- ${tool.name}`,
  );
  return `AVAILABLE TOOLS — the lean baseline (bash, read, write, edit, sero-cli) is ALWAYS available to every background-agent step (never list it). Add any of these ADDITIONAL tools to a step's "execution.tools" only when it plainly needs them (exact names):
${lines.join('\n')}

`;
}

export function buildPlanningTask(
  prompt: string,
  useManagedWorktree: boolean,
  toolCatalog: PlanningToolInfo[] = [],
): string {
  return `A background agent will carry out the work below. Author the step plan it should follow — do not perform the work yourself, and do not ask the user to specify mechanics like committing, opening a PR, or marking the loop complete. Add those yourself per the rules.

Goal:
${prompt}

If this goal mentions any cadence or repetition ("every N minutes", "hourly", "each morning", "periodically", "until …"), the loop is ALREADY scheduled to re-run automatically — author exactly ONE pass of the work. Do NOT add a step that waits, sleeps, delays, polls on a timer, or repeats/loops the plan; such a step is wrong. Process one item per run (e.g. resolve ONE issue). You do NOT need to detect or handle the goal's stop condition — that is judged separately after each run.

${buildToolCatalogBlock(toolCatalog)}${useManagedWorktree ? WORKTREE_DELIVERY : WORKSPACE_ROOT_DELIVERY}

Return the PlanningResponse JSON now (one object, top-level "plan", no prose).`;
}

export function buildRepairTask(prompt: string, previous: string, errors: string[]): string {
  return `Your previous PlanningResponse failed structural validation.

User prompt:
${prompt}

Your previous response:
${previous}

Validation errors:
${errors.map((e) => `- ${e}`).join('\n')}

Return a corrected PlanningResponse JSON that fixes every error. Output ONLY the JSON object.`;
}
