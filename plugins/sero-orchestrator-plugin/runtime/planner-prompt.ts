/**
 * Prompt builders for plan generation and repair.
 *
 * The planning prompt must NOT ask the model to choose workspace root or
 * worktree use — that is a user-level loop setting (D-06).
 */

export const PLANNING_SYSTEM_PROMPT = `You are the planner for Sero Orchestrator. Turn the user's prompt into a durable, LLM-authored step plan.

Return ONLY a single JSON object matching this shape (no prose, no markdown fences):

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
        "execution": { "type": "background-agent" }
          | { "type": "model", "outputSchema": object? }
          | { "type": "active-session", "sessionTarget": {
                "workspaceId": string, "strategy": "specific-session"|"most-recent-active"|"ask-user",
                "deliverAs": "steer"|"followUp"|"nextTurn", "triggerTurn": boolean } }
      }
    ]
  },
  "suggestedTriggers": [ { "type": "manual"|"cron"|"event"|"hybrid", "schedule": string?, "eventSource": string?, "maxFires": number? } ]?,
  "suggestedLimits": { "maxAttemptsPerStep": number?, "maxConcurrentSteps": number?, "maxTotalTokens": number? }?
}

Rules:
- Sequential work is expressed with dependsOn. Parallel work is independent steps with satisfied dependencies.
- To make a loop able to COMPLETE, include a validation/finalization step whose work decides completion. Completion is signaled by a step outcome, never inferred.
- Use "background-agent" for filesystem/code/tool work, "model" for pure reasoning/structured output, "active-session" only when the work must happen in the user's live session.
- Do NOT mention worktrees, the workspace root, git stashing, or any workspace-isolation choice. That is decided by the user, not the plan.
- Step ids must be unique and dependsOn must reference existing step ids. The dependency graph must be acyclic.`;

export function buildPlanningTask(prompt: string): string {
  return `User prompt:\n${prompt}\n\nReturn the PlanningResponse JSON now.`;
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
