# Promptfoo Eval Integration Plan

**Status:** Implemented (historical design notes)
**Date:** 2026-04-06

> This document is the original implementation plan. For the current workflow and runtime behavior, use [`docs/testing/eval-guide.md`](./eval-guide.md). The shipped eval harness now runs Promptfoo through `node scripts/run-promptfoo.mjs ...`, applies runtime API-key overrides, and uses `eval/evalCli.ts` for the eval-only `sero-cli` shim.

## Goal

Track Sero's agent performance across releases using [Promptfoo](https://promptfoo.dev)
structured evals. Evals exercise the real `pi-coding-agent` SDK path — not mocks —
so regressions in tool routing, code generation, and multi-turn coherence are caught
before they ship.

---

## 1. How It Fits Into Sero

```
promptfoo eval
  └─ promptfooconfig.yaml
       ├── provider: eval/seroProvider.ts   ← custom Promptfoo provider
       ├── tests: eval/scenarios/*.yaml     ← per-category test suites
       └── assertions: JS + LLM-rubric

eval/seroProvider.ts
  └─ imports from @mariozechner/pi-coding-agent
       ├── AuthStorage, ModelRegistry, SettingsManager (shared-infra pattern)
       ├── createAgentSession + SessionManager.inMemory()
       └── session.prompt() → collect events → return to Promptfoo
```

Promptfoo runs headless — no Electron, no containers, no workspaces. The provider
creates a **minimal** agent session with host-only tools against a temp directory.
This tests the core agent loop (model selection, tool dispatch, multi-turn memory)
without the desktop shell overhead.

---

## 2. Project Structure

```
sero/
├── eval/
│   ├── seroProvider.ts           # Custom Promptfoo provider
│   ├── setup.ts                  # Temp dir + infra bootstrap/teardown
│   ├── scenarios/
│   │   ├── coding-tasks.yaml     # Code generation quality
│   │   ├── file-ops.yaml         # Read/write/edit tool accuracy
│   │   ├── multi-turn.yaml       # Conversation coherence
│   │   └── error-recovery.yaml   # Graceful failure handling
│   └── assertions/
│       └── toolSequence.ts       # Assert tool-call order/presence
├── promptfooconfig.yaml
└── (root package.json — add promptfoo to devDependencies)
```

This lives at the **monorepo root**, not inside `apps/desktop/`, because:
- Evals are a cross-cutting concern, not a desktop feature.
- Avoids polluting the Electron build with promptfoo deps.
- `turbo.json` can add an `eval` task without touching existing build graph.

---

## 3. Provider Design — Differences from the Spec

The external spec assumed `AuthStorage.create()` and `ModelRegistry.create(authStorage)`
with no arguments. Sero's actual infra (see `electron/shared/infra/shared-infra.ts`)
requires explicit paths:

```
AuthStorage.create(`${agentDir}/auth.json`)
new ModelRegistry(authStorage, `${agentDir}/models.json`)
SettingsManager.create(agentDir, agentDir)
```

The eval provider must replicate this, pointing at the real `~/.sero-ui/agent/`
directory so it picks up the user's configured API keys and model preferences.

### Key design decisions

| Concern | Spec assumption | Sero reality | Provider approach |
|---|---|---|---|
| Auth/keys | `AuthStorage.create()` (default) | Explicit path to `auth.json` | Use `SERO_AGENT_DIR` or allow override via env var |
| Model selection | Hardcoded in config | Tier-based fallback chain | Accept `model` in provider config, fall back to registry |
| Working directory | Implicit | Workspace-bound, container-optional | Create temp dir per eval, clean up after |
| Extensions | Not mentioned | Sero extensions (memory, kanban, etc.) | Skip extensions — eval tests core agent, not plugins |
| Resource loader | Not mentioned | `DefaultResourceLoader` with overrides | Use `DefaultResourceLoader` with minimal config |
| Session storage | `SessionManager.inMemory()` | `SessionManager.open(path, dir)` | Use `inMemory()` — evals are ephemeral |
| Container tools | Not applicable | Host or container tools | Host-only tools via `createHostCodingTools(tmpDir)` |
| Custom tools | Not mentioned | Platform tools, CLI bridge | Omit — evals test the model + base tools |

### Provider skeleton (refined)

```typescript
// eval/seroProvider.ts
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { setupTempDir, teardownTempDir } from './setup';

const SERO_AGENT_DIR = process.env.SERO_AGENT_DIR
  ?? `${process.env.HOME}/.sero-ui/agent`;

interface ProviderConfig {
  model?: string;
  timeout?: number;
}

export default class SeroProvider implements ApiProvider {
  private config: ProviderConfig;

  constructor(opts: { config?: ProviderConfig } = {}) {
    this.config = { timeout: 120_000, ...opts.config };
  }

  id() {
    return `sero:${this.config.model ?? 'default'}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const tmpDir = await setupTempDir();
    const start = Date.now();

    try {
      const authStorage = AuthStorage.create(`${SERO_AGENT_DIR}/auth.json`);
      const modelRegistry = new ModelRegistry(
        authStorage,
        `${SERO_AGENT_DIR}/models.json`,
      );
      const settingsManager = SettingsManager.create(
        SERO_AGENT_DIR,
        SERO_AGENT_DIR,
      );

      const loader = new DefaultResourceLoader({
        cwd: tmpDir,
        agentDir: SERO_AGENT_DIR,
        settingsManager,
      });
      await loader.reload();

      const { session } = await createAgentSession({
        cwd: tmpDir,
        agentDir: SERO_AGENT_DIR,
        authStorage,
        modelRegistry,
        tools: [],
        customTools: [],          // no platform tools for evals
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(),
        settingsManager,
      });

      // Collect events
      const toolCalls: Array<{ name: string; args: unknown }> = [];
      let fullText = '';

      session.subscribe((event: any) => {
        // Adjust field names to match actual SDK event shapes
        if (event.type === 'message_update') {
          const ae = event.assistantMessageEvent;
          if (ae?.type === 'text_delta') fullText += ae.delta;
          if (ae?.type === 'tool_use') {
            toolCalls.push({ name: ae.name, args: ae.input });
          }
        }
      });

      await Promise.race([
        session.prompt(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.config.timeout),
        ),
      ]);

      return {
        output: fullText,
        metadata: {
          latencyMs: Date.now() - start,
          toolCalls,
          toolCallCount: toolCalls.length,
        },
      };
    } catch (err: any) {
      return { error: `Agent error: ${err.message}` };
    } finally {
      await teardownTempDir(tmpDir);
    }
  }
}
```

> **Important:** The event shapes above are approximations. Before implementing,
> verify against the actual SDK version by checking
> `node_modules/@mariozechner/pi-coding-agent/dist/` type exports or the
> `agent-subscription.ts` mapping in `electron/ipc/agent/core/`.

---

## 4. Multi-Turn Strategy

The spec proposed parsing `[Turn N]` markers and calling `session.prompt()` multiple
times within one session. This is correct — pi-coding-agent sessions are stateful,
so sequential `.prompt()` calls accumulate context naturally.

Create a separate `SeroMultiTurnProvider` that:
1. Splits the prompt on `[Turn N]` markers.
2. Creates one session.
3. Calls `session.prompt()` for each turn sequentially.
4. Returns the final turn's output + metadata from all turns.

This can be a phase-2 addition. Start with single-turn evals.

---

## 5. Scenario Categories

### Agent scenarios (require `ANTHROPIC_API_KEY`)

| Category | File | What it tests | Assertion types |
|---|---|---|---|
| **File operations** | `file-ops.yaml` | Agent uses write/edit/read tools correctly | JS on `metadata.toolCalls` |
| **Code generation** | `coding-tasks.yaml` | Produces valid TS/React output | `contains` + `llm-rubric` |
| **CLI operations** | `cli-ops.yaml` | Agent uses `sero-cli` for platform actions, batching | JS on `metadata.toolCalls` |

### Prompt stability scenarios (no API key needed)

| Category | File | What it tests | Assertion types |
|---|---|---|---|
| **Prompt caching** | `prompt-stability.yaml` | SDK base prompt size, hash, structure | JS on snapshot metadata |

Run prompt stability checks with `pnpm eval:snapshot` — fast (~2s), deterministic,
safe for every CI build. These use the `snapshotProvider.ts` which creates a headless
session and captures `session.agent.state` without sending any prompts.

**Why this matters for caching:** Anthropic's prompt caching keys on the exact prefix
of the system prompt. If the prompt structure changes (even whitespace), the cache
invalidates and costs increase. The snapshot evals catch drift early.

**Metadata access in assertions:** Use `context.providerResponse.metadata` (not
`output.metadata`). Promptfoo passes `output` as a string; metadata lives on the
context object.

### Example: file-ops.yaml

```yaml
- description: "Create a file and verify content"
  vars:
    scenario_prompt: >
      Create a file called hello.ts that exports a function greet(name: string)
      returning a greeting string. Then read it back and confirm its contents.
  assert:
    - type: javascript
      value: |
        const meta = context.providerResponse?.metadata ?? {};
        const tools = (meta.toolCalls || []).map(t => t.name);
        const wrote = tools.some(t => ['write', 'edit'].includes(t));
        const read = tools.includes('read');
        return { pass: wrote && read, score: wrote && read ? 1 : 0 };
    - type: contains
      value: "greet"
    - type: javascript
      value: |
        const ms = output.metadata?.latencyMs || 0;
        return { pass: ms < 60000, score: Math.max(0, 1 - ms / 60000) };
```

---

## 6. Package Changes

### Root `package.json`

```jsonc
{
  "devDependencies": {
    "promptfoo": "^0.100.0"   // pin to a recent stable version
  },
  "scripts": {
    "eval": "promptfoo eval",
    "eval:view": "promptfoo view"
  }
}
```

No need to add `@mariozechner/pi-coding-agent` to root — it's already in the
pnpm catalog. The eval provider imports it directly; pnpm hoisting makes it
available.

### `turbo.json`

```jsonc
{
  "tasks": {
    "eval": {
      "cache": false,
      "dependsOn": ["build"]
    }
  }
}
```

Evals depend on `build` so plugins/packages are compiled first, but results
are never cached (non-deterministic LLM output).

---

## 7. CI Integration

Add a **manual-trigger** workflow first. Evals are expensive (real API calls),
so don't gate every PR.

```yaml
# .github/workflows/eval.yaml
name: Sero Eval
on:
  workflow_dispatch:
    inputs:
      description:
        description: "Run label (e.g. v0.12.0, pre-release)"
        required: false

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Setup agent dir
        run: |
          mkdir -p ~/.sero-ui/agent
          echo '{}' > ~/.sero-ui/agent/auth.json
          echo '{}' > ~/.sero-ui/agent/models.json
      - name: Run evals
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: pnpm eval --output eval-results.json --description "${{ inputs.description }}"
      - name: Check pass rate
        run: |
          node -e "
            const r = require('./eval-results.json');
            const total = r.results.length;
            const passed = r.results.filter(x => x.success).length;
            const rate = passed / total;
            console.log('Pass rate: ' + passed + '/' + total + ' (' + (rate*100).toFixed(1) + '%)');
            if (rate < 0.7) process.exit(1);
          "
      - uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: eval-results.json
```

Use `workflow_dispatch` initially. Move to `pull_request` trigger once the suite
is stable and thresholds are calibrated.

---

## 8. Tracking Results Over Time

Promptfoo stores history in `~/.promptfoo/` locally. For release tracking:

1. **Tag runs** with Sero version: `pnpm eval --description "v0.12.0"`
2. **Archive results** as CI artifacts (see workflow above).
3. **Compare models** by adding a second provider entry in `promptfooconfig.yaml`
   with a different `model` config value.
4. **Dashboard** (future): parse `eval-results.json` artifacts into a simple
   trend chart — pass rate + avg latency over time.

---

## 9. Implementation Phases

### Phase 1 — Foundation (done)

- [x] Create `eval/` directory structure at monorepo root
- [x] Implement `seroProvider.ts` with single-turn support
- [x] Implement `setup.ts` (temp dir create/teardown)
- [x] Write `promptfooconfig.yaml`
- [x] Create 3-5 scenarios in `file-ops.yaml` and `coding-tasks.yaml`
- [x] Add `promptfoo` + `pi-coding-agent` to root devDependencies
- [x] Add `eval` / `eval:view` scripts to root `package.json`
- [x] Add `eval` task to `turbo.json`
- [x] Verify event shapes match actual SDK version
- [x] Fix drizzle-orm async transaction bug (`eval/patch-drizzle.cjs`)
- [x] Create `eval/assertions/toolSequence.ts` helper
- [x] Verify end-to-end: provider loads, scenarios parse, SDK initializes
- [ ] Run full eval with API key, calibrate assertion thresholds

### Phase 2 — Expand

- [ ] Add `multi-turn.yaml` scenarios + `SeroMultiTurnProvider`
- [ ] Add `error-recovery.yaml` scenarios
- [ ] Add `toolSequence.ts` assertion helper
- [ ] Add `eval` task to `turbo.json`
- [ ] Add CI workflow (manual trigger)

### Phase 3 — Mature

- [ ] Add model comparison (Sonnet vs Haiku side-by-side)
- [ ] Build results dashboard or integrate Promptfoo Cloud sharing
- [ ] Gate PRs on pass rate once suite is stable
- [ ] Add Sero-specific scenarios (workspace ops, extension interactions)

---

## 10. Known Issue: drizzle-orm Async Transaction Bug

Promptfoo uses drizzle-orm 0.35.x which passes `async` callbacks to
better-sqlite3's synchronous `db.transaction()`. This causes FK constraint
failures because the transaction commits before the async operations complete.

**Workaround:** `eval/patch-drizzle.cjs` patches drizzle-orm's
`better-sqlite3/session.cjs` to wrap async callbacks in a sync wrapper.
The `pnpm eval` script runs this patch automatically before each eval.
Run `node eval/patch-drizzle.cjs` manually after `pnpm install` if needed.

This is only needed for promptfoo <=0.107; future versions may fix this.

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SDK event shapes change between versions | Provider breaks silently | Pin `pi-coding-agent` version; add a smoke test that checks event types |
| LLM non-determinism causes flaky evals | False failures in CI | Use `threshold` < 1.0 on `llm-rubric`; require 70% pass rate, not 100% |
| Eval costs (real API calls per run) | Budget overrun | Start with 5-10 scenarios; use `workflow_dispatch` not PR-triggered CI |
| Auth setup in CI | Evals fail without API keys | Store `ANTHROPIC_API_KEY` in GitHub secrets; `setup agent dir` step in workflow |
| No container/workspace in eval context | Some agent behaviors differ | Accept this — evals test core agent loop, not desktop integration. Full integration tests remain separate. |

---

## 12. What the Spec Got Right / What Needs Adjustment

**Keep from spec:**
- Overall architecture (custom provider wrapping SDK)
- Scenario YAML structure with mixed assertion types
- `metadata.toolCalls` + `metadata.latencyMs` pattern
- Multi-turn via sequential `session.prompt()` calls
- CI workflow structure

**Adjust:**
- `AuthStorage.create()` → needs explicit path arg (`auth.json`)
- `ModelRegistry.create(auth)` → `new ModelRegistry(auth, path)`
- Add `SettingsManager` — required by `DefaultResourceLoader`
- Add `DefaultResourceLoader` — required by `createAgentSession`
- Use pnpm, not npm
- Skip extensions/containers in eval provider (simplify)
- Start with `workflow_dispatch`, not PR-gated CI
- Temp dir setup/teardown per eval run (the spec missed this)
- Lower pass-rate threshold to 70% initially (spec used 80%)
