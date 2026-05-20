# E2E Test Coverage — Phase 4: Agent Realism Layer Implementation Plan

**Date:** 2026-05-18  
**Spec:** `docs/superpowers/specs/2026-05-17-e2e-test-coverage-design.md`  
**Depends on:** Phases 0-3  
**Scope:** Real LLM-backed agent flows from sections 5 and 11.

## Goal

Add a small, opt-in `agent` Playwright layer that makes real provider calls only when `SERO_E2E_LLM_MODE=cheap|full`. The layer should validate Sero's complete agent loop without exact-text coupling:

- A basic real round-trip answers `2+2`.
- A forced host-runtime tool call reads a deterministic workspace file.
- A multi-turn conversation preserves context.
- A model switch keeps the same conversation alive.
- The agent can call the Phase 3 local MCP fixture through the `mcp` bridge tool.

## Constraints

- Default mode remains `SERO_E2E_LLM_MODE=off`; tests skip without launching Electron or calling a provider.
- Never commit real credentials. Parse local credentials from `apps/desktop/e2e/.env.test` if present, while allowing shell/CI env to win; forward only the selected provider key to Electron.
- Use isolated temp `SERO_HOME` via `createTempSeroHome()` / `launchWorkflowApp()`.
- Prefer IPC/event assertions over DOM; agent specs may use `page.evaluate` and `window.sero.agent.onEvent`.
- Assertions are loose: event/tool presence, stable sentinel strings, and essential answer content only.
- Model-switch coverage must use an explicit `SERO_E2E_LLM_ALT_MODEL`; never auto-select arbitrary provider models.
- No exact assistant prose snapshots.
- Keep touched source/spec files under 500 LOC.
- Do not push or update PR without explicit approval.

## Implementation tasks

1. Extend `helpers/llm.ts` with `.env.test` loading and provider/model selection helpers.
2. Add `helpers/agent.ts` to create/open sessions and collect `AgentStreamEvent`s until `agent_end`.
3. Add `agent-realism.agent.spec.ts` for arithmetic, read-tool, multi-turn, and model-switch flows.
4. Add `mcp-agent.agent.spec.ts` for a real agent call into the local MCP fixture.
5. Add `.github/workflows/e2e-agent.yml` for nightly cheap mode and manual cheap/full dispatch.
6. Verify skip mode and deterministic layers:
   - `pnpm --filter @sero/desktop e2e:agent`
   - `pnpm typecheck`
   - `pnpm --filter @sero/desktop e2e:contract`
   - `SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow`

## Acceptance criteria

- With default env, the agent suite skips cleanly and performs no provider calls.
- With credentials and `SERO_E2E_LLM_MODE=cheap|full`, the agent suite configures an available model and collects stream events for all real-agent scenarios.
- MCP agent test uses only the local stdio fixture from Phase 3.
- CI workflow is opt-in/nightly, uses secrets rather than committed credentials, and fails fast when enabled provider credentials are missing.
