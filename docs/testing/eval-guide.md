# Sero Eval Guide

Structured evaluation framework for tracking agent performance across releases using [Promptfoo](https://promptfoo.dev).

## Quick Start

```bash
# Snapshot evals — fast, no API key, safe for CI (~2s)
pnpm eval:snapshot

# Agent evals — requires ANTHROPIC_API_KEY (real LLM calls, ~2min)
pnpm eval

# OpenShell runtime evals — requires ANTHROPIC_API_KEY + OpenShell prerequisites
pnpm eval:openshell

# View results in browser
pnpm eval:view

# Or use the shell script directly
./eval/run.sh                    # Agent evals
./eval/run.sh snapshot           # Snapshot evals
./eval/run.sh openshell          # OpenShell runtime evals
./eval/run.sh --filter-first-n 3 # First 3 agent tests only
```

## Eval Modes

### 1. Snapshot Evals (no LLM calls)

**Config:** `eval/promptfoo-snapshot.yaml`
**Provider:** `eval/snapshotProvider.ts`
**Scenarios:** `eval/scenarios/prompt-stability.yaml` (7 tests)

These assemble an approximation of the full Sero session prompt by calling the pure prompt-building functions from `apps/desktop/electron/`. The subagent and container blocks are imported directly from the real source. The CLI block uses a **reconstructed registry** with hardcoded command names (since the real registration path requires Electron), so it tests the prompt *template* and *structure* but not the exact live command list. They verify:

- All prompt blocks are present (SDK base + CLI + subagent)
- Block content has expected keywords (sero-cli commands, subagent guidance)
- Block ordering is correct (critical for Anthropic prompt caching)
- Total prompt size hasn't grown more than 20% from baseline
- Snapshot metadata is complete

**When to run:** Before every commit that touches agent prompts, CLI commands, or session setup. Safe to add to CI — no API key needed, runs in ~2 seconds.

**What breaks the cache:** Anthropic's prompt caching keys on the exact prefix of the system prompt. If any block changes content, order, or even whitespace, the cache invalidates. These evals catch that drift.

### 2. Agent Evals (real LLM calls)

**Config:** `promptfooconfig.yaml` (project root)
**Provider:** `eval/seroProvider.ts`
**Scenarios:** 10 tests across 3 files:

| File | Tests | What it covers |
|------|-------|----------------|
| `file-ops.yaml` | 3 | File create, read, edit via agent tools |
| `coding-tasks.yaml` | 3 | React component generation, null-safety fixes, utility functions |
| `cli-ops.yaml` | 4 | Agent uses `sero-cli` for todos, workspace info, batch commands, VCS |

**When to run:** Before releases, after SDK upgrades, or when changing agent behavior. Requires `ANTHROPIC_API_KEY` and costs real API tokens.

**Runtime shape of the harness:**
- Each scenario runs in its own isolated temp workspace under `/tmp/sero-eval-*`
- The temp workspace is initialised as a clean Git repo so VCS/workspace prompts behave predictably
- The provider exposes real coding tools (`read`, `bash`, `write`, `edit`) plus a small eval-only `sero-cli` shim for deterministic Sero platform checks
- Raw extension tools are intentionally hidden during agent evals so CLI scenarios assert against `sero-cli`, not direct tool calls like `todo` or `git_manager`

**Auth behavior:**
- `pnpm eval` honors `ANTHROPIC_API_KEY` from the shell or from `--env-path .env`
- The provider applies env credentials as runtime overrides before falling back to `~/.sero-ui/agent/auth.json`
- This prevents stale OAuth entries in `auth.json` from breaking evals that should use an API key

### 3. OpenShell Runtime Evals (real LLM calls + OpenShell)

**Config:** `eval/promptfoo-openshell.yaml`
**Provider:** `eval/seroProvider.ts` with `openShellRuntime` enabled
**Scenarios:** `eval/scenarios/openshell-runtime.yaml`

These are the Phase 6 runtime evals. They run regular Sero agent prompts but expose only runtime-backed `bash`, create a fresh OpenShell sandbox per case, collect command/log metadata, and write replay/debug artifacts under `eval/output/openshell/`.

**When to run:** After changing OpenShell runtime adapters, sync semantics, CLI command shapes, or multi-agent/eval orchestration. Requires `ANTHROPIC_API_KEY`, OpenShell CLI, and the selected local/remote/cloud gateway prerequisites.

## Current Risk Map

Evals in Sero are meant to cover the parts of the system where a structured
prompt- or agent-behavior check is the best signal. They are **not** intended
to replace desktop unit tests, Playwright coverage, or clean-launch smoke.

| Risk area | Best current signal | Why |
|---|---|---|
| Prompt block drift / cache invalidation | `pnpm eval:snapshot` | Snapshot evals assemble the real system prompt and verify block presence, order, and size |
| Agent file-tool behavior | `pnpm eval` | Real LLM runs exercise `read` / `write` / `edit` in isolated temp workspaces |
| Agent CLI behavior | `pnpm eval` | The eval harness checks that the agent prefers `sero-cli` for supported platform actions |
| OpenShell runtime isolation | `pnpm eval:openshell` | Real LLM runs exercise `bash` inside a fresh OpenShell sandbox per case, with runtime metadata and failure artifacts |
| Desktop launch / session wiring | desktop unit tests + Playwright | Better validated in repo tests than promptfoo |
| Plugin/runtime bridge regressions | desktop unit tests + focused e2e | Better caught by package/unit/e2e coverage than generic eval prompts |
| Container lifecycle / full-render UX | local Playwright runs | Environment-sensitive and intentionally outside promptfoo |

### Non-goals of the eval layer

The eval layer does **not** currently aim to prove:
- full desktop UI correctness
- full plugin/runtime compatibility across all packages
- container lifecycle reliability in CI
- that every source test suite in the repo has run

That is why:
- `pnpm eval:snapshot` is the best low-cost prompt-stability check
- `pnpm eval` is a manual/nightly release-confidence layer
- repo unit/e2e coverage remains the primary regression net for desktop and
  plugin integration behavior

## File Layout

```
eval/
├── seroProvider.ts              # Agent provider (real LLM calls)
├── evalCli.ts                   # Eval-only sero-cli shim + temp workspace seeding
├── snapshotProvider.ts          # Snapshot provider (no LLM calls)
├── openshellEvalRuntime.ts      # OpenShell eval sandbox/log/artifact runtime
├── setup.ts                     # Temp directory helpers
├── patch-drizzle.cjs            # Workaround for drizzle-orm async tx bug
├── run.sh                       # Convenience runner
├── promptfoo-snapshot.yaml      # Snapshot eval config
├── promptfoo-openshell.yaml     # OpenShell runtime eval config
├── scenarios/
│   ├── file-ops.yaml            # File operation scenarios
│   ├── coding-tasks.yaml        # Code generation scenarios
│   ├── cli-ops.yaml             # CLI tool usage scenarios
│   ├── openshell-runtime.yaml   # OpenShell runtime proof/isolation scenarios
│   └── prompt-stability.yaml    # Prompt caching stability scenarios
├── assertions/
│   └── toolSequence.ts          # Reusable tool-sequence assertion
└── helpers/
    └── sessionSnapshot.ts       # Session capture + diff utilities
promptfooconfig.yaml             # Main agent eval config (project root)
```

## Maintaining Evals

### After an SDK Upgrade

1. Run `pnpm eval:snapshot` — if the SDK base prompt changed, tests will fail
2. Verify the change is intentional
3. Run the snapshot eval again to get the new total prompt size
4. Update the `BASELINE` value in `eval/scenarios/prompt-stability.yaml`
5. Commit the updated baseline alongside the SDK version bump

### After Changing Sero Prompts

Any edit to these files can break prompt caching:

- `electron/cli/index.ts` — `buildCliPromptBlock()` (CLI command listings)
- `electron/features/container/tools/system-prompt.ts` — `buildContainerPromptBlock()`
- `electron/features/subagent/extensions/prompt.ts` — `buildSubagentPromptBlock()`
- `electron/features/apps/extensions/create-sero-extension.ts` — prompt assembly order

After editing:
1. Run `pnpm eval:snapshot`
2. If the growth test fails, update `BASELINE` in `prompt-stability.yaml`
3. If the ordering test fails, you've changed the assembly order — make sure this is intentional

### After `pnpm install`

The drizzle-orm patch must be re-applied after installing dependencies:

```bash
node eval/patch-drizzle.cjs
```

Both `pnpm eval` and `./eval/run.sh` do this automatically. If you need to invoke promptfoo manually, use `node scripts/run-promptfoo.mjs ...` instead of `npx promptfoo ...`; the wrapper runs promptfoo under Electron's Node ABI so `better-sqlite3` stays compatible.

## Writing New Scenarios

### Adding an Agent Scenario

Create or edit a YAML file in `eval/scenarios/`. Each scenario has a prompt, optional vars, and assertions:

```yaml
- description: "Agent creates a React hook"
  vars:
    scenario_prompt: "Create a custom React hook called useDebounce that debounces a value"
  assert:
    # Simple output check
    - type: contains
      value: "useDebounce"
    # Check tool usage via metadata
    - type: javascript
      value: |
        const meta = context.providerResponse?.metadata ?? {};
        const tools = meta.toolCalls || [];
        const usedWrite = tools.some(t => t.name === 'write');
        return {
          pass: usedWrite,
          score: usedWrite ? 1.0 : 0.0,
          reason: usedWrite
            ? 'Agent used write tool to create the file'
            : `Agent tools: [${tools.map(t => t.name).join(', ')}]`
        };
```

Then add the file to `promptfooconfig.yaml`:

```yaml
tests:
  - file://./eval/scenarios/file-ops.yaml
  - file://./eval/scenarios/your-new-file.yaml  # add here
```

### Adding a Snapshot Scenario

Add a test to `eval/scenarios/prompt-stability.yaml`:

```yaml
- description: "CLI block lists the memory command"
  vars:
    scenario_prompt: "snapshot"
  assert:
    - type: javascript
      value: |
        const m = context.providerResponse?.metadata ?? {};
        const cli = m.cliBlock || '';
        const has = cli.includes('memory');
        return {
          pass: has,
          score: has ? 1.0 : 0.0,
          reason: has ? 'memory command found in CLI block' : 'memory command missing from CLI block'
        };
```

### Key Patterns

**Accessing metadata in assertions:** Always use `context.providerResponse?.metadata`, not `output.metadata`. The `output` variable is a string.

**Available metadata from the agent provider (`seroProvider`):**
- `toolCalls` — array of `{ name, args }` for every tool the agent called
- `toolCallCount` — number of tool calls
- `latencyMs` — wall-clock time for the agent run
- `snapshot.systemPrompt` — the system prompt text
- `snapshot.toolNames` — list of available tool names
- `openShell` — present for `pnpm eval:openshell`; includes provider/gateway/sandbox names, runtime workspace path, command records, captured log lines, artifact path, and cleanup/retention state

**Available metadata from the snapshot provider:**
- `systemPrompt` — full assembled Sero prompt
- `sdkBasePrompt`, `cliBlock`, `containerBlock`, `subagentBlock` — individual blocks
- `systemPromptLength`, `cliBlockLength`, etc. — char counts
- `systemPromptHash` — SHA-256 of the full prompt

**Reusable tool-sequence assertion** (`eval/assertions/toolSequence.ts`):
```yaml
- type: javascript
  value: file://./eval/assertions/toolSequence.ts
  config:
    required: ["write", "read"]
    forbidden: ["bash"]
    # orderedSubset: ["read", "edit"]  # optional: checks order
```

**File-based assertion signature:** When using `value: file://...`, promptfoo calls `(output: string, context: { providerResponse, vars, ... })` — NOT a single input object. Always destructure `context.providerResponse?.metadata` for metadata access.

**sero-cli tool args shape:** The sero-cli tool takes `{ command: string, timeout?: number }`. When checking tool call args in assertions, use `t.args?.command` to access the command string.

## OpenShell Runtime Evals

`pnpm eval:openshell` runs a separate promptfoo config that enables `openShellRuntime` in the normal Sero eval provider.

Current behavior:
- each promptfoo case gets a unique temp workspace and unique OpenShell sandbox name
- only `bash` is exposed from the coding tool set; `read` / `write` / `edit` remain unavailable so evals do not silently fall back to the host filesystem
- host files are uploaded before each `bash` command and downloaded afterward
- logs and command records are included in `context.providerResponse.metadata.openShell`
- per-run artifacts are written under `eval/output/openshell/<sandbox>/result.json`; failed runs also include `workspace-snapshot/`
- failed sandboxes are retained by default for replay/debug, successful sandboxes are destroyed

Remote/cloud scaling:
- uncomment the remote/cloud providers in `eval/promptfoo-openshell.yaml`
- set `gatewayName` in config or `SERO_EVAL_OPENSHELL_GATEWAY`
- each case uses a fresh sandbox, so promptfoo can compare multiple gateway/model/provider configurations without sharing runtime state
- `gpuProfile: true` records GPU profile intent only; it does not enforce OpenShell GPU policy until Sero's Phase 3 policy enforcement follow-up lands

## Viewing Results

```bash
pnpm eval:view
```

Opens a local web UI showing pass/fail history, score trends, and detailed output for each scenario. Results are stored in promptfoo's local database (`~/.promptfoo/`).

## Comparing Models

Uncomment the second provider in `promptfooconfig.yaml` to run scenarios against multiple models side-by-side. The `model` config is passed to `session.setModel()` in `seroProvider.ts`:

```yaml
providers:
  - id: file://./eval/seroProvider.ts
    label: "Sero (Sonnet)"
  - id: file://./eval/seroProvider.ts
    label: "Sero (Haiku)"
    config:
      model: claude-haiku-4-5-20251001
      timeout: 60000
```

Promptfoo runs each scenario against every listed provider and displays results side-by-side in the web viewer (`pnpm eval:view`).

## Troubleshooting

**`FOREIGN KEY constraint failed` from promptfoo** — The drizzle-orm patch needs re-applying. Run `node eval/patch-drizzle.cjs` or use `pnpm eval` which applies it automatically.

**`NODE_MODULE_VERSION` / `better-sqlite3` mismatch** — Use `pnpm eval`, `pnpm eval:snapshot`, `pnpm eval:view`, or `node scripts/run-promptfoo.mjs ...`. Those commands run promptfoo under Electron's Node runtime so it matches the `better-sqlite3` binary rebuilt in `postinstall`.

**Anthropic auth still fails even with `ANTHROPIC_API_KEY` set** — A stale `anthropic` OAuth entry in `~/.sero-ui/agent/auth.json` can shadow env-based auth. The eval provider now applies env vars as runtime API-key overrides, but if you still need to debug, inspect `~/.sero-ui/agent/auth.json` and check whether the `anthropic` entry is an expired OAuth token.

**`Cannot find module '@sinclair/typebox'` when running evals** — Run `pnpm install` from the monorepo root. The eval harness uses TypeBox for its local `sero-cli` tool schema, and the dependency is declared at the workspace root.

**`Cannot find module` errors in snapshot provider** — Dynamic imports require `.ts` extensions. If adding a new import, use the full path: `path.join(SERO_ROOT, 'apps/desktop/electron/.../file.ts')`.

**Snapshot tests fail after `pnpm install`** — Re-apply the drizzle patch: `node eval/patch-drizzle.cjs`.

**Agent evals hang or timeout** — Increase `timeout` in the provider config (default 120s). Some complex coding tasks need more time.

**`No "exports" main defined`** — The pi-coding-agent SDK is ESM-only. The providers use `await import()` to handle this. Don't change to static imports.
