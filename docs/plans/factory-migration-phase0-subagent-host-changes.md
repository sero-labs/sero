# Factory Migration Phase 0: Subagent Host Changes (H1–H3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three additive host contract changes (result metadata, abort signal, platform-tool policy) on `runStructured` for plugin background runtimes, plus the one-line Factory safety hotfix.

**Architecture:** All three changes flow through one pipeline: `AppRuntimeSubagentRunParams`/`AppRuntimeSubagentResult` in `@sero-ai/common` → pass-through in `create-host.ts` (no code change; runtime spread) → `SingleRunParams`/`SingleRunResult` in `core/single-run.ts` → `RunnerConfig`/`RunResult` in `runtime/runner.ts`. Defaults preserve existing behaviour exactly (`platformTools: 'all'`, no signal, extra result fields optional). Tool-surface enforcement uses the session `tools` allowlist (not just platform-tool omission) because extension-registered tools survive `noTools: 'builtin'`; abort must also release runs queued in the concurrency pool.

**Tech Stack:** TypeScript, vitest (`apps/desktop`), pnpm workspaces.

**Spec:** `gstackplugin/docs/specs/sero-factory/2026-06-12-sero-runtime-subagents-integration-spec.md` — section "Required Sero host changes (agreed, land before Phase 3)".

**Repos:** Tasks 1–7 run in the sero monorepo (`/Users/danielcarter/Documents/Dev/projects/sero/sero`). Task 8 runs in the Factory plugin repo (`/Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin`).

**Known pre-existing failure:** the desktop suite has one red test (token-baseline CLI block) unrelated to this work. Everything else must be green.

---

### Task 1: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the working branch from main**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero
git checkout main && git pull
git checkout -b feat/subagent-host-changes-phase0
```

- [ ] **Step 2: Commit this plan document**

```bash
git add docs/plans/factory-migration-phase0-subagent-host-changes.md
git commit -m "docs(plans): add factory migration phase 0 host-changes plan"
```

---

### Task 2: Contract types in @sero-ai/common (H1 + H2 + H3)

**Files:**
- Modify: `packages/common/src/app-runtime-background.ts:18-36`

- [ ] **Step 1: Extend the run params and result interfaces**

Replace the existing `AppRuntimeSubagentRunParams` and `AppRuntimeSubagentResult` (lines 18–36) with:

```ts
export interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  parentSessionId: string;
  workspaceId: string;
  cwd?: string;
  isolated?: boolean;
  customTools?: unknown[];
  onUpdate?: (text: string) => void;
  /**
   * Platform tool surface for the subagent session.
   * - 'all' (default): bash, read, write, edit, sero-cli, browser
   * - 'readOnly': the platform read tool only
   * - 'none': no platform tools and no workspace-runtime startup —
   *   the session gets only customTools (enforced via a session tool
   *   allowlist, which also excludes extension-registered tools)
   */
  platformTools?: 'all' | 'readOnly' | 'none';
  /**
   * Optional external cancellation. Aborting resolves the run (never
   * throws) with an `error` beginning with 'Aborted' — 'Aborted' for an
   * in-flight run, 'Aborted before start' for one that never started.
   * Aborting a run still queued for a concurrency slot resolves it
   * promptly without consuming a slot.
   */
  signal?: AbortSignal;
}

export interface AppRuntimeSubagentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AppRuntimeSubagentResult {
  response: string;
  error?: string;
  /** Concrete model id the session ran with (when resolvable; best effort on failure paths). */
  modelId?: string;
  /** Provider id for modelId — model ids are not globally unique. */
  providerId?: string;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs?: number;
  /** Token usage totals (when the provider reports them). */
  usage?: AppRuntimeSubagentUsage;
}
```

`AppRuntimeSubagentsApi` (lines 38–45) needs no change — it references these types.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` (monorepo root)
Expected: zero errors. The new fields are optional, so all existing callers (kanban runtime included) still compile.

- [ ] **Step 3: Commit**

```bash
git add packages/common/src/app-runtime-background.ts
git commit -m "feat(common): add platformTools, signal, and result metadata to subagent runtime contract"
```

---

### Task 3: H3 — platform-tool policy with allowlist enforcement

**Files:**
- Modify: `apps/desktop/electron/features/subagent/core/types.ts` (add `PlatformToolPolicy`, extend `RunnerConfig`)
- Modify: `apps/desktop/electron/features/subagent/core/single-run.ts` (extend `SingleRunParams`, pass through)
- Modify: `apps/desktop/electron/features/subagent/runtime/runner.ts` (helpers + restructured tool/runtime setup + session options)
- Test: `apps/desktop/electron/__tests__/features/subagent/platform-tool-policy.test.ts` (new)

Two enforcement facts drive this design (verified): Pi's `noTools: 'builtin'` disables only built-ins — tools registered by extensions loaded into the session (the loader pulls in compatible plugin extensions) remain enabled, so restricted policies need an explicit `tools` allowlist. And `runtime.ensure()` exists only to back platform tools, so `'none'` skips workspace-runtime startup entirely (tool-less runs work without Docker/Apple container).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/__tests__/features/subagent/platform-tool-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { filterPlatformTools, sessionToolOptions } from '@electron/features/subagent/runtime/runner';

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: [] }),
  } as unknown as ToolDefinition;
}

const PLATFORM = ['bash', 'read', 'write', 'edit', 'sero-cli'].map(tool);

describe('filterPlatformTools', () => {
  it("returns all tools for 'all'", () => {
    expect(filterPlatformTools(PLATFORM, 'all')).toHaveLength(5);
  });

  it("returns only the read tool for 'readOnly'", () => {
    expect(filterPlatformTools(PLATFORM, 'readOnly').map((t) => t.name)).toEqual(['read']);
  });

  it("returns no tools for 'none'", () => {
    expect(filterPlatformTools(PLATFORM, 'none')).toEqual([]);
  });
});

describe('sessionToolOptions', () => {
  it("disables only builtins for 'all' (no allowlist — current behaviour)", () => {
    expect(sessionToolOptions('all', PLATFORM)).toEqual({ noTools: 'builtin' });
  });

  it("allowlists exactly the session tools for 'none' (excludes extension tools)", () => {
    const custom = [tool('factory_read_file'), tool('factory_submit_artefact')];
    expect(sessionToolOptions('none', custom)).toEqual({
      noTools: 'builtin',
      tools: ['factory_read_file', 'factory_submit_artefact'],
    });
  });

  it("allowlists read plus custom tools for 'readOnly'", () => {
    const combined = [tool('read'), tool('factory_submit_artefact')];
    expect(sessionToolOptions('readOnly', combined)).toEqual({
      noTools: 'builtin',
      tools: ['read', 'factory_submit_artefact'],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/platform-tool-policy.test.ts`
Expected: FAIL — `filterPlatformTools` and `sessionToolOptions` are not exported.

- [ ] **Step 3: Add the policy type to core types**

In `apps/desktop/electron/features/subagent/core/types.ts`, after the `TaskOverride` interface at the end of the file, add:

```ts
// ── Platform tool policy ─────────────────────────────────────

/** Platform tool surface granted to a subagent session. */
export type PlatformToolPolicy = 'all' | 'readOnly' | 'none';
```

In the same file, add to `RunnerConfig` (after the `customTools` field):

```ts
  /** Platform tool surface: 'all' (default), 'readOnly' (read only), or 'none'. */
  platformTools?: PlatformToolPolicy;
```

- [ ] **Step 4: Implement the helpers and restructure the runner**

In `apps/desktop/electron/features/subagent/runtime/runner.ts`:

Add `ToolDefinition` to the pi type import (line 14):

```ts
import type { CreateAgentSessionOptions, ToolDefinition } from '@earendil-works/pi-coding-agent';
```

Add `PlatformToolPolicy` to the core types import (line 18):

```ts
import type { RunnerConfig, RunResult, SubagentUsage, SubagentToolActivity, PlatformToolPolicy } from '../core/types';
```

Add both exported pure functions after `resolveSubagentPaths`:

```ts
/**
 * Apply the platform-tool policy to the workspace tool set.
 * 'none' callers skip building platform tools entirely; this filter
 * handles 'all' and 'readOnly'.
 */
export function filterPlatformTools(
  tools: ToolDefinition[],
  policy: PlatformToolPolicy,
): ToolDefinition[] {
  if (policy === 'none') return [];
  if (policy === 'readOnly') return tools.filter((tool) => tool.name === 'read');
  return tools;
}

/**
 * Session tool enforcement for the platform-tool policy.
 *
 * `noTools: 'builtin'` disables only Pi built-ins; tools registered by
 * extensions loaded into the session survive it. Restricted policies
 * therefore set an explicit allowlist of exactly the session's tools,
 * which excludes extension-registered tools as well.
 */
export function sessionToolOptions(
  policy: PlatformToolPolicy,
  sessionTools: ToolDefinition[],
): Pick<CreateAgentSessionOptions, 'noTools' | 'tools'> {
  if (policy === 'all') return { noTools: 'builtin' };
  return { noTools: 'builtin', tools: sessionTools.map((tool) => tool.name) };
}
```

Replace the runtime/tool setup block (from `const runtime = await runtimeManager.getRuntime(workspaceId);` through `const customTools = [...platformTools, ...(config.customTools ?? [])];`) with:

```ts
  const policy = config.platformTools ?? 'all';
  let platformTools: ToolDefinition[] = [];
  if (policy !== 'none') {
    const runtime = await runtimeManager.getRuntime(workspaceId);
    try {
      await runtime.ensure();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[subagent/runner] ${runtime.backend} runtime unavailable: ${message}`);
      return {
        response: '',
        usage: { ...EMPTY_USAGE },
        error: `${runtime.backend} runtime failed to start for workspace ${workspaceId}: ${message}`,
      };
    }
    platformTools = filterPlatformTools(
      await createRuntimeTools(runtime, subagentSessionId, containerCwd),
      policy,
    );
  }
  const customTools = [...platformTools, ...(config.customTools ?? [])];
```

In the `sessionOptions` object, replace the `noTools: 'builtin',` line with:

```ts
      ...sessionToolOptions(policy, customTools),
```

- [ ] **Step 5: Plumb the param through single-run**

In `apps/desktop/electron/features/subagent/core/single-run.ts`:

Add `PlatformToolPolicy` to the type import from `'./types'`, then add to `SingleRunParams` (after `customTools`):

```ts
  /** Platform tool surface for the session. Default: 'all'. */
  platformTools?: PlatformToolPolicy;
```

In `executeSingleRun`, add to the `runSubagent` config object (after `customTools: params.customTools,`):

```ts
        platformTools: params.platformTools,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/platform-tool-policy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck
git add apps/desktop/electron/features/subagent apps/desktop/electron/__tests__/features/subagent/platform-tool-policy.test.ts
git commit -m "feat(subagent): platform-tool policy with session allowlist enforcement"
```

Note: the spread in `create-host.ts:83-86` forwards the new params at runtime, but TypeScript does **not** verify forwarding — object spreads bypass excess-property checks, and the hand-enumerated `RunnerConfig` construction in `executeSingleRun` is exactly where a field can be silently dropped. The forwarding test in Task 4 guards that hop.

---

### Task 4: H1 — result metadata (modelId, providerId, durationMs, usage)

**Files:**
- Modify: `apps/desktop/electron/features/subagent/core/types.ts:85-92` (`RunResult` metadata)
- Modify: `apps/desktop/electron/features/subagent/runtime/runner.ts` (capture metadata on all post-session paths)
- Modify: `apps/desktop/electron/features/subagent/core/single-run.ts` (`SingleRunResult` fields)
- Modify: `apps/desktop/electron/features/subagent/index.ts:119` (`runSingleStructured` return type)
- Test: `apps/desktop/electron/__tests__/features/subagent/single-run.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/electron/__tests__/features/subagent/single-run.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@electron/features/subagent/runtime/runner', () => ({
  runSubagent: vi.fn(),
}));

import { executeSingleRun, type SingleRunParams } from '@electron/features/subagent/core/single-run';
import { runSubagent, type RunnerDeps } from '@electron/features/subagent/runtime/runner';
import type { ConcurrencyPool } from '@electron/features/subagent/core/pool';
import type { SubagentTracker } from '@electron/features/subagent/core/tracker';
import type { AgentConfig, SubagentSettings } from '@electron/features/subagent/core/types';

const mockRunSubagent = vi.mocked(runSubagent);

const SETTINGS: SubagentSettings = {
  maxConcurrent: 4,
  maxTotal: 8,
  timeoutMs: 600_000,
  toolStallTimeoutMs: 120_000,
  model: null,
  thinking: null,
};

const AGENT: AgentConfig = {
  name: 'factory-test',
  description: 'test agent',
  systemPrompt: 'You are a test agent.',
  source: 'global',
  filePath: '',
};

const USAGE = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 150,
  cost: 0.01,
};

function options(params: Partial<SingleRunParams> = {}) {
  return {
    params: {
      task: 'do the thing',
      parentSessionId: 'parent-1',
      workspaceId: 'ws-1',
      systemPrompt: 'You are a test agent.',
      ...params,
    },
    settings: SETTINGS,
    pool: {
      acquireSlot: vi.fn(async () => {}),
      releaseSlot: vi.fn(),
    } as unknown as ConcurrencyPool,
    tracker: {
      start: vi.fn(),
      progress: vi.fn(),
      updateToolActivity: vi.fn(),
      appendLiveOutput: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as unknown as SubagentTracker,
    deps: {} as RunnerDeps,
    resolveAgent: vi.fn(async () => AGENT),
  };
}

beforeEach(() => {
  mockRunSubagent.mockReset();
});

describe('executeSingleRun result metadata', () => {
  it('returns modelId, providerId, durationMs, and usage on success', async () => {
    mockRunSubagent.mockResolvedValue({
      response: 'done',
      usage: USAGE,
      modelId: 'claude-test-1',
      providerId: 'anthropic',
    });

    const result = await executeSingleRun(options());

    expect(result.response).toBe('done');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns metadata alongside the error on failure', async () => {
    mockRunSubagent.mockResolvedValue({
      response: '',
      usage: USAGE,
      modelId: 'claude-test-1',
      providerId: 'anthropic',
      error: 'boom',
    });

    const result = await executeSingleRun(options());

    expect(result.error).toBe('boom');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(result.usage?.totalTokens).toBe(150);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('forwards platformTools to the runner config', async () => {
    mockRunSubagent.mockResolvedValue({ response: 'ok', usage: USAGE });

    await executeSingleRun(options({ platformTools: 'none' }));

    expect(mockRunSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ platformTools: 'none' }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/single-run.test.ts`
Expected: FAIL — `RunResult` has no `modelId`/`providerId`; `SingleRunResult` has no metadata fields.

- [ ] **Step 3: Add metadata to `RunResult`**

In `apps/desktop/electron/features/subagent/core/types.ts`, replace the `RunResult` interface (lines 85–92) with:

```ts
export interface RunResult {
  /** Full response text from the subagent. */
  response: string;
  /** Token and cost usage. */
  usage: SubagentUsage;
  /** Concrete model id the session ran with (when resolvable). */
  modelId?: string;
  /** Provider id for modelId — model ids are not globally unique. */
  providerId?: string;
  /** Error message if the run failed. */
  error?: string;
}
```

- [ ] **Step 4: Capture metadata on all post-session paths in the runner**

In `apps/desktop/electron/features/subagent/runtime/runner.ts`:

Replace the success-path returns:

```ts
    // Check if we were aborted or timed out
    if (signal.aborted) {
      return { response: '', usage, modelId: session.model?.id, providerId: session.model?.provider, error: 'Aborted' };
    }
```

and replace the final `return { response, usage };` with:

```ts
    return { response, usage, modelId: session.model?.id, providerId: session.model?.provider };
```

Replace the `catch` block (best-effort provenance — the session may exist even when the run failed):

```ts
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    const usage: SubagentUsage = { ...EMPTY_USAGE };
    try {
      const stats = session?.getSessionStats();
      if (stats) {
        usage.inputTokens = stats.tokens.input;
        usage.outputTokens = stats.tokens.output;
        usage.cacheReadTokens = stats.tokens.cacheRead;
        usage.cacheWriteTokens = stats.tokens.cacheWrite;
        usage.totalTokens = stats.tokens.total;
        usage.cost = stats.cost;
      }
    } catch { /* session unusable — keep zeros */ }
    const modelId = session?.model?.id;
    const providerId = session?.model?.provider;

    // Distinguish timeout from other errors
    if (signal.aborted) {
      return { response: '', usage, modelId, providerId, error: 'Aborted' };
    }

    return { response: '', usage, modelId, providerId, error: errorMsg };
  } finally {
```

(`session.model` is the live Pi `Model` — `AgentSession` exposes `get model(): Model<any> | undefined`; `Model.provider` is a string.)

- [ ] **Step 5: Extend `SingleRunResult` and populate it**

In `apps/desktop/electron/features/subagent/core/single-run.ts`, replace the `SingleRunResult` interface (lines 51–54) with:

```ts
export interface SingleRunResult {
  response: string;
  error?: string;
  /** Concrete model id the session ran with (when resolvable). */
  modelId?: string;
  /** Provider id for modelId — model ids are not globally unique. */
  providerId?: string;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs?: number;
  /** Token usage totals. */
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}
```

In `executeSingleRun`, replace the result-handling block (from `if (result.error) {` through the success `return { response: result.response };`) with:

```ts
    const durationMs = Date.now() - entry.startedAt;
    const usage = {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    };

    if (result.error) {
      tracker.fail(runId, result.error, result.usage);
      onUpdate?.(`❌ ${agent.name} failed — ${result.error}`);
      return {
        response: '',
        error: result.error,
        modelId: result.modelId,
        providerId: result.providerId,
        durationMs,
        usage,
      };
    }

    tracker.complete(runId, result.response, result.usage);
    const durationSec = Math.round(durationMs / 1000);
    const tokenCount = result.usage.totalTokens;
    onUpdate?.(`✅ ${agent.name} completed (${durationSec}s, ${tokenCount} tokens)`);
    return {
      response: result.response,
      modelId: result.modelId,
      providerId: result.providerId,
      durationMs,
      usage,
    };
```

In the `catch` block, replace `return { response: '', error: msg };` with:

```ts
    return { response: '', error: msg, durationMs: Date.now() - entry.startedAt };
```

- [ ] **Step 6: Update the façade return type**

In `apps/desktop/electron/features/subagent/index.ts`, add `SingleRunResult` to the single-run import (line 13):

```ts
import { executeSingleRun, type SingleRunParams, type SingleRunResult } from './core/single-run';
```

and change the `runSingleStructured` signature (line 119) to:

```ts
  async runSingleStructured(params: SingleRunParams): Promise<SingleRunResult> {
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/single-run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck and commit**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck
git add apps/desktop/electron/features/subagent apps/desktop/electron/__tests__/features/subagent/single-run.test.ts
git commit -m "feat(subagent): return model identity, duration, and usage from structured subagent runs"
```

---

### Task 5: H2 — external abort signal, including while queued

**Files:**
- Modify: `apps/desktop/electron/features/subagent/core/pool.ts:56-89` (abort-aware `acquireSlot`)
- Modify: `apps/desktop/electron/features/subagent/core/single-run.ts` (accept and wire `signal`)
- Test: `apps/desktop/electron/__tests__/features/subagent/pool-abort.test.ts` (new)
- Test: `apps/desktop/electron/__tests__/features/subagent/single-run.test.ts` (extend)

The pool's FIFO waiters do not observe aborts today: an aborted run still waits for a free slot before the runner returns 'Aborted before start'. `acquireSlot` must resolve promptly on abort without registering the slot (the subsequent `releaseSlot` is already a safe no-op for unregistered keys).

- [ ] **Step 1: Write the failing pool tests**

Create `apps/desktop/electron/__tests__/features/subagent/pool-abort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ConcurrencyPool } from '@electron/features/subagent/core/pool';

describe('ConcurrencyPool abort while queued', () => {
  it('resolves a queued acquire promptly on abort, without taking a slot', async () => {
    const pool = new ConcurrencyPool(1, 1);
    const a = new AbortController();
    const b = new AbortController();

    await pool.acquireSlot('a', 'parent', a);

    const queued = pool.acquireSlot('b', 'parent', b);
    b.abort();
    await queued; // must resolve without waiting for slot 'a' to free

    expect(pool.getActiveCount()).toBe(1); // only 'a' holds a slot
    pool.releaseSlot('b', 'parent'); // no-op — 'b' never registered
    expect(pool.getActiveCount()).toBe(1);
  });

  it('returns immediately when acquiring with an already-aborted controller', async () => {
    const pool = new ConcurrencyPool(1, 1);
    const a = new AbortController();
    await pool.acquireSlot('a', 'parent', a);

    const b = new AbortController();
    b.abort();
    await pool.acquireSlot('b', 'parent', b); // resolves despite zero capacity
    expect(pool.getActiveCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the pool tests to verify they fail**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/pool-abort.test.ts`
Expected: FAIL — both tests time out (acquire never resolves while capacity is exhausted).

- [ ] **Step 3: Make `acquireSlot` abort-aware**

In `apps/desktop/electron/features/subagent/core/pool.ts`, replace the `acquireSlot` method body (lines 56–89) with:

```ts
  async acquireSlot(
    key: string,
    parentSessionId: string,
    controller: AbortController,
    callGroup?: string,
  ): Promise<void> {
    const signal = controller.signal;

    const waitForCapacity = async (hasCapacity: () => boolean): Promise<void> => {
      if (signal.aborted || hasCapacity()) return;
      await new Promise<void>((resolve) => {
        const waiter: Waiter = {
          resolve: () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          },
        };
        const onAbort = () => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0) this.waiters.splice(idx, 1);
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        this.waiters.push(waiter);
      });
      if (signal.aborted) return;
      await waitForCapacity(hasCapacity);
    };

    // Wait for global capacity
    await waitForCapacity(() => this.active.size < this.maxTotal);
    if (signal.aborted) return; // aborted while queued — do not take the slot

    // Wait for per-call capacity (if call group is specified)
    if (callGroup) {
      await waitForCapacity(() => (this.callCounts.get(callGroup) ?? 0) < this.maxConcurrent);
      if (signal.aborted) return;
      this.callCounts.set(callGroup, (this.callCounts.get(callGroup) ?? 0) + 1);
    }

    // Register the slot
    this.active.set(key, { parentSessionId, controller, callGroup });

    // Track abort controller by parent session
    let controllers = this.parentAbortMap.get(parentSessionId);
    if (!controllers) {
      controllers = new Set();
      this.parentAbortMap.set(parentSessionId, controllers);
    }
    controllers.add(controller);
  }
```

Aborted acquires return without registering: the caller proceeds to `runSubagent`, which immediately returns `'Aborted before start'`, and the `finally` `releaseSlot` is a no-op.

- [ ] **Step 4: Run the pool tests to verify they pass**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/pool-abort.test.ts electron/__tests__/features/subagent/pool.test.ts`
Expected: PASS — both new tests and the existing pool suite (no behaviour change without abort).

- [ ] **Step 5: Write the failing single-run signal tests**

Append to the `describe` block in `single-run.test.ts`:

```ts
  it('aborts the run when the external signal is already aborted', async () => {
    mockRunSubagent.mockImplementation(async (config) => {
      expect(config.signal.aborted).toBe(true);
      return { response: '', usage: USAGE, error: 'Aborted before start' };
    });

    const controller = new AbortController();
    controller.abort();
    const result = await executeSingleRun(options({ signal: controller.signal }));

    expect(result.error).toBe('Aborted before start');
  });

  it('forwards a later external abort to the runner signal', async () => {
    const controller = new AbortController();
    mockRunSubagent.mockImplementation(async (config) => {
      controller.abort();
      expect(config.signal.aborted).toBe(true);
      return { response: '', usage: USAGE, error: 'Aborted' };
    });

    const result = await executeSingleRun(options({ signal: controller.signal }));

    expect(result.error).toBe('Aborted');
  });
```

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/single-run.test.ts`
Expected: FAIL — `signal` is not a `SingleRunParams` field, and the internal signal never aborts.

- [ ] **Step 6: Wire the external signal in single-run**

In `apps/desktop/electron/features/subagent/core/single-run.ts`, add to `SingleRunParams` (after `platformTools`):

```ts
  /** Optional external cancellation. Aborting resolves the run with an error beginning with 'Aborted'. */
  signal?: AbortSignal;
```

In `executeSingleRun`, directly after `const controller = new AbortController();`, add:

```ts
  const externalSignal = params.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  }
```

Replace the `finally` block with:

```ts
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort);
    pool.releaseSlot(runId, parentSessionId);
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/desktop && pnpm vitest run electron/__tests__/features/subagent/single-run.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Typecheck and commit**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck
git add apps/desktop/electron/features/subagent apps/desktop/electron/__tests__/features/subagent
git commit -m "feat(subagent): external AbortSignal on structured runs, abort-aware concurrency pool"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/plugins/host-compatibility.md`

- [ ] **Step 1: Document the new contract fields**

In `docs/plugins/host-compatibility.md`, find the section covering the `appRuntime.background` capability (or the section listing host APIs available to background runtimes). Add:

```markdown
### Subagent run options and result metadata (2026-06)

`host.subagents.runStructured(...)` accepts three additive options:

- `platformTools?: 'all' | 'readOnly' | 'none'` — platform tool surface for the
  session. `'all'` (default) grants bash, read, write, edit, sero-cli, and
  browser; `'readOnly'` grants the read tool only; `'none'` grants no platform
  tools — the session is restricted to your `customTools` via a tool allowlist
  (extension-registered tools are excluded too) and skips workspace-runtime
  startup, so tool-less runs work without a container runtime. Use `'none'`
  when the plugin owns its full tool envelope (e.g. read-only planning agents).
- `signal?: AbortSignal` — external cancellation. Aborting resolves the call
  (never throws) with an `error` beginning with `'Aborted'` — `'Aborted'` for
  an in-flight run, `'Aborted before start'` for one that never started. Runs
  still queued for a concurrency slot resolve promptly without taking a slot.

The result includes optional metadata when available: `modelId` and
`providerId` (the concrete model that ran — provider-qualified, since model ids
are not globally unique), `durationMs`, and `usage` (`inputTokens`,
`outputTokens`, `totalTokens`). Metadata is best-effort on failure paths too.
Record the resolved identity rather than the requested model when you need
honest provenance — tier aliases resolve at run time.
```

- [ ] **Step 2: Commit**

```bash
git add docs/plugins/host-compatibility.md
git commit -m "docs(plugins): document subagent platformTools, signal, and result metadata"
```

---

### Task 7: Monorepo verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: zero errors across all packages.

- [ ] **Step 2: Full desktop test suite**

Run: `cd apps/desktop && pnpm test`
Expected: all green except the known pre-existing token-baseline CLI block failure. The existing subagent tests (`discovery`, `tracker`, `resolve`, `runner`, `pool`, `integration`) must pass unchanged — they prove default behaviour (`'all'`, no signal) is untouched.

- [ ] **Step 3: Hold for PR**

Do not push. Report completion; PR creation happens on explicit approval (repo rule).

---

### Task 8: Factory hotfix — disable builtin tools in vendored agent (separate repo)

**Files:**
- Modify: `/Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin/extension/agent.ts:66-73`

Context: Pi's `createAgentSession` enables built-in `read`/`bash`/`edit`/`write` unless `noTools` is set (`pi-coding-agent/dist/core/sdk.d.ts:36-44`). The vendored `WorkflowAgent` never sets it, so plan-only sessions currently have shell and write tools enabled. This hotfix is independent of Phase 0 and ships immediately.

- [ ] **Step 1: Create a branch in the Factory repo**

```bash
cd /Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin
git checkout -b fix/plan-only-no-builtin-tools
```

- [ ] **Step 2: Add `noTools: 'builtin'` to the session options**

In `extension/agent.ts`, replace the `createAgentSession` call (lines 66–73) with:

```ts
    const { session } = await createAgentSession({
      cwd: this.cwd,
      agentDir,
      sessionManager: SessionManager.inMemory(this.cwd),
      settingsManager: SettingsManager.create(this.cwd, agentDir),
      customTools,
      ...this.sessionOptions,
      noTools: 'builtin',
    });
```

`noTools: 'builtin'` goes **after** the `...this.sessionOptions` spread: this is a safety guarantee, so callers must not be able to re-enable built-ins accidentally. No current call site passes session options (verified: `workflowAdapter.ts`, `recipeGenerator.ts`, `implementationExecutor.ts`, `externalActionExecutor.ts` pass only `cwd`/`tools`/`instructions`), and the test suite uses the mock-agent seam, not session options.

- [ ] **Step 3: Typecheck and run the Factory suite**

```bash
pnpm typecheck && pnpm test
```

Expected: zero type errors; all tests pass (the suite uses the mock agent seam, so it exercises orchestration, not real sessions).

- [ ] **Step 4: Manual verification in Sero**

1. Start dev with the factory plugin and open a Factory workspace.
2. Run the `structured_output_probe` action via `factory_runs` — expected: probe succeeds (structured output is a custom tool, unaffected).
3. Run one plan-only run end to end — expected: role agents complete using `factory_read_file`/`factory_search_text` etc.; behaviour unchanged.
4. If an implementation-mode run fails to write files after this change, that means it was silently using builtin `write`/`edit` instead of the tracked Factory tools — report this finding rather than reverting; it would itself be a bug (untracked changes bypass the review gate and rollback).

- [ ] **Step 5: Commit**

```bash
git add extension/agent.ts
git commit -m "fix(agent): disable Pi builtin coding tools in workflow agent sessions"
```

---

## Phase gate — acceptance criteria

Phase 0 is complete when all are true (maps to spec section "Required Sero host changes"):

1. `AppRuntimeSubagentRunParams` accepts `platformTools` and `signal`; `AppRuntimeSubagentResult` carries `modelId`, `providerId`, `durationMs`, `usage` (Task 2; root typecheck and the kanban runtime compiling unchanged).
2. With `platformTools: 'none'`, the session's tool allowlist contains exactly the caller's `customTools` — platform **and** extension-registered tools excluded — and no workspace runtime is started; `'readOnly'` grants platform `read` only; default `'all'` is byte-identical to current behaviour (Task 3 tests + existing suite green).
3. An external `AbortSignal` cancels an in-flight run, resolving (never throwing) with an error beginning with `'Aborted'`; a run queued behind the concurrency pool resolves promptly on abort without consuming a slot (Task 5 pool + single-run tests).
4. Success, failure, and abort results all carry best-effort `modelId`/`providerId`, plus `durationMs` and token usage (Task 4 tests).
5. Param forwarding is guarded by tests, not types — object spreads bypass excess-property checks, so the `executeSingleRun` → `RunnerConfig` hop has an explicit forwarding test (Task 4).
6. Factory plan-only sessions no longer expose builtin bash/edit/write, and the guarantee cannot be overridden via session options (Task 8; manual probe + plan-only run).
7. `pnpm typecheck` clean at root; desktop suite green except the documented pre-existing failure (Task 7).

## What this plan deliberately excludes

Phases 1–6 of the migration (Factory repo). Their plans are written just-in-time per phase against then-current code — Phase 2 relocates ~2k LOC that later phases build on, so pre-writing those task lists would produce stale instructions. Each phase plan follows this same format and ends with a phase gate lifted from the spec's acceptance criteria.
