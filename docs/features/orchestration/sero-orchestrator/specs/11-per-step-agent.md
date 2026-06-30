# 11 · Per-step subagent (agent role)

Status: **done**. Lets a background-agent step run as a **named agent role**
(the `.md` agents in `~/.sero-ui/agent/agents/`, the same ones the rest of Sero's
`subagent` tool uses) instead of the default ad-hoc agent. The role can be chosen
**automatically by the planner** or **overridden by the user** per step — mirroring
the existing per-step **model** and **tools** controls.

## Decisions (confirmed)

1. **Scope: background-agent steps only.** `model` steps are pure reasoning and
   `active-session` steps run in the user's own chat — an agent role doesn't apply
   there.
2. **Missing agent ⇒ fall back + warn.** If a step's chosen agent can't be found at
   run time (deleted/renamed after planning, or a planner hallucination), the step
   runs with the default ad-hoc agent and the loop shows an amber warning — exactly
   like the existing `model-unavailable` fallback. The loop never hard-blocks on it.
3. **Agent defaults apply.** The agent's frontmatter `model`/`thinking` apply when
   the step hasn't pinned its own; an explicit per-step model/tier still wins (this
   is just the existing `resolveConfig` precedence — no new code).

## The one subtlety: preserving the step contract

Background-agent steps must always emit the `StepOutcome` JSON envelope, which the
orchestrator injects as `STEP_SYSTEM_PROMPT`. Today that contract rides through the
subagent runner's **ad-hoc** `systemPrompt` channel. But the desktop resolver
(`SubagentManager.resolveAgent`) treats *any* passed `systemPrompt` as an ad-hoc
agent and **ignores a named agent's `.md` body**. So you can't pass both.

Fix: a dedicated **`appendSystemPrompt: string[]`** channel on the subagent run.
The runner already delivers an agent's `.md` body via the resource loader's
`appendSystemPrompt`; we merge the orchestrator's contract on top:
`appendSystemPrompt: [agent.systemPrompt, ...callerAppend].filter(Boolean)`. So a
named-agent step gets: base Sero prompt (or the loop's context override) → the
agent's role body → the step contract. The no-agent path is unchanged (ad-hoc
`systemPrompt` = the contract).

## Layers

### Desktop core (`@sero-ai/common` + electron subagent)
- `AppRuntimeSubagentRunParams.appendSystemPrompt?: string[]` — appended after the
  resolved agent body (the orchestrator's step contract).
- `AppRuntimeAgentInfo { name; description }` + `AppRuntimeSubagentsApi.listAgentCatalog(workspaceId)`
  — the real agent catalog (`SubagentManager.listAgents()` mapped), for the planner.
- `AvailableContext.agents: AppRuntimeAgentInfo[]` — so the renderer's existing
  `useSubagentContext` hook also carries the agent list for the per-step dropdown.
- Runner merges `appendSystemPrompt`; `single-run` threads it through; `create-host`
  implements `listAgentCatalog`; the subagent-context handler fills `agents`.

### Plugin runtime
- `BackgroundAgentTarget.agent?: string` — the chosen role (planner or user).
- `host.runStructured` gains `agent` + `appendSystemPrompt`; `OrchestratorHost`
  gains `listAgentCatalog()`.
- Executor (`executors/common.ts`): when a step pins an agent, verify it against the
  catalog (only when pinned, like the model check); if present → `agent` + contract
  on `appendSystemPrompt`; if missing → ad-hoc fallback + `agentFallback` marker.
- `run-engine` records an `agent-unavailable` `LoopWarning` from `agentFallback`
  (mirrors `model-unavailable`).
- Planner: `listAgentCatalog()` feeds an AGENT block in the planning task; the
  planner may set `execution.agent` per background-agent step.
- `schema.ts` validates `execution.agent` is a non-empty string.
- `plan-mapping.applyStepAgent` + `set_step_agent` action + coordinator handler.

### Plugin UI
- `StepAgentControl` — a small dropdown (Default + the workspace's agents) on each
  background-agent step card, beside Model and Tools. Sourced from `context.agents`.

## Acceptance
- A background-agent step can run as a named agent (planner-picked or user-set); the
  step contract still applies and the outcome envelope still parses.
- A missing agent falls back to ad-hoc and surfaces one amber warning; the loop runs.
- Tools/skills disabling and per-step model/tools keep working.
- `pnpm typecheck` clean; plugin + desktop tests green.
