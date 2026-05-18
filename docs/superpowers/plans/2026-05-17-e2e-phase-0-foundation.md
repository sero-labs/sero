# E2E Test Coverage — Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2-project (`ci`/`local`) Playwright setup with a 3-project (`contract`/`workflow`/`agent`) structure, ship the foundational helpers that subsequent phases will build on (`seroHome`, `runtime`, `llm`, extended `launchSeroApp`), scaffold the fixtures directory, and migrate the existing 8 specs into the new structure with their current behaviour preserved.

**Architecture:** Helpers are pure modules where possible (`seroHome`, `runtime`, `llm`) so they're unit-testable via the existing vitest harness; the extended Electron launcher composes them. The 3-project Playwright config uses file-suffix conventions (`*.contract.spec.ts`, `*.workflow.spec.ts`, `*.agent.spec.ts`) so each spec's project assignment is visible in the filename. Two of today's specs (`agent.spec.ts`, `app-launch.spec.ts`) mix IPC and UI tests and are split during migration; the rest are renamed in place.

**Tech Stack:** Playwright (Electron), Vitest, TypeScript, pnpm, Bash. No new runtime dependencies are introduced.

**Out of scope for Phase 0:** Synthetic test-plugin & test-MCP-server content (Phase 3), `helpers/agent.ts` / `helpers/cli.ts` / `helpers/assertions.ts` (added when the consuming phase needs them — YAGNI), GitHub Actions workflow files (Phase 1+), `data-testid` audits beyond what migration requires, the interactive `pnpm e2e` picker, and the `regenerate-fixtures.sh` / `build-test-plugin.sh` scripts.

**Exit criterion (from spec):** The existing 8 specs still pass under the new 3-project structure on the maintainer's macOS Apple Silicon machine — `pnpm --filter @sero/desktop e2e:contract` green, `pnpm --filter @sero/desktop e2e:workflow` green for `host` + `apple-container`, `pnpm --filter @sero/desktop e2e:agent` reports "no tests" cleanly.

---

## File Structure

**Create:**
- `apps/desktop/e2e/helpers/seroHome.ts` — temp-dir SERO_HOME lifecycle + seeders.
- `apps/desktop/e2e/helpers/runtime.ts` — runtime-backend selection + skip logic.
- `apps/desktop/e2e/helpers/llm.ts` — LLM-mode env reader + `requireLlm` skip helper.
- `apps/desktop/e2e/helpers/__tests__/seroHome.test.ts` — vitest unit tests.
- `apps/desktop/e2e/helpers/__tests__/runtime.test.ts` — vitest unit tests.
- `apps/desktop/e2e/helpers/__tests__/llm.test.ts` — vitest unit tests.
- `apps/desktop/e2e/fixtures/.gitkeep` — placeholder; real fixtures arrive in later phases.
- `apps/desktop/e2e/.env.test.example` — example env file for local LLM keys.
- `apps/desktop/scripts/e2e-doctor.sh` — verifies machine prerequisites per layer.

**Modify:**
- `apps/desktop/e2e/helpers/electron-app.ts` — extend `LaunchOptions` and `launchSeroApp` to accept `{ seroHome?, runtime?, seed?, mockRelaunch? }`; keep current default behaviour.
- `apps/desktop/e2e/helpers/index.ts` — re-export new helpers.
- `apps/desktop/playwright.config.ts` — replace the 2 projects with 3 (contract/workflow/agent), tag-aware, with per-project `testIgnore` driven by file-suffix and platform.
- `apps/desktop/package.json` — replace `test:e2e*` scripts with `e2e`, `e2e:contract`, `e2e:workflow`, `e2e:agent`, `e2e:doctor`.
- `apps/desktop/vitest.config.ts` — add `e2e/helpers/__tests__/**/*.test.ts` to `include`.
- `.gitignore` — add `apps/desktop/e2e/.env.test`.
- All 8 existing specs in `apps/desktop/e2e/*.spec.ts` — renamed and (for two of them) split.

**Migration table (existing → new):**

| Current file                | Becomes                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `agent.spec.ts`             | `agent-ipc.contract.spec.ts` + `agent-ui.workflow.spec.ts` (split)      |
| `app-launch.spec.ts`        | `app-launch.contract.spec.ts` + `app-shell.workflow.spec.ts` (split)    |
| `container.spec.ts`         | `container.workflow.spec.ts`                                            |
| `file-tree.spec.ts`         | `file-tree.workflow.spec.ts`                                            |
| `layout.spec.ts`            | `layout.workflow.spec.ts`                                               |
| `memory.spec.ts`            | `memory.contract.spec.ts`                                               |
| `memory-snapshot.spec.ts`   | `memory-snapshot.contract.spec.ts`                                      |
| `scroll-fix.spec.ts`        | `scroll-fix.workflow.spec.ts`                                           |
| `vcs.spec.ts`               | `vcs.workflow.spec.ts`                                                  |

---

## Task 1: Set up `.env.test` plumbing and gitignore

**Files:**
- Create: `apps/desktop/e2e/.env.test.example`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Append the ignore rule**

Edit `.gitignore` (repo root) — add at the bottom:

```gitignore

# e2e LLM credentials (per-developer, never committed)
apps/desktop/e2e/.env.test
```

- [ ] **Step 2: Create the example env file**

Write `apps/desktop/e2e/.env.test.example`:

```env
# Copy this file to .env.test and fill in real values to run the agent suite.
# .env.test is gitignored.

# Provider for agent-realism tests. "anthropic" (default), "openai", "google", ...
SERO_E2E_LLM_PROVIDER=anthropic

# Provider API key
ANTHROPIC_API_KEY=

# LLM tier:
#   off    — skip @agent tests (default)
#   cheap  — Haiku-tier, < $0.10/run, used by nightly CI
#   full   — Sonnet/Opus, < $2/run, manual only
SERO_E2E_LLM_MODE=off
```

- [ ] **Step 3: Verify ignore rule works**

Run from repo root:

```bash
touch apps/desktop/e2e/.env.test && git check-ignore -v apps/desktop/e2e/.env.test && rm apps/desktop/e2e/.env.test
```

Expected: a line like `.gitignore:NN:apps/desktop/e2e/.env.test    apps/desktop/e2e/.env.test`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore apps/desktop/e2e/.env.test.example
git commit -m "chore(e2e): scaffold .env.test plumbing for agent realism layer"
```

---

## Task 2: Build `helpers/llm.ts` with vitest unit tests

**Files:**
- Create: `apps/desktop/e2e/helpers/llm.ts`
- Create: `apps/desktop/e2e/helpers/__tests__/llm.test.ts`
- Modify: `apps/desktop/vitest.config.ts`

- [ ] **Step 1: Add the helper tests dir to vitest include**

Edit `apps/desktop/vitest.config.ts`. Change:

```ts
    include: [
      'electron/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
```

to:

```ts
    include: [
      'electron/__tests__/**/*.test.ts',
      'e2e/helpers/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
```

- [ ] **Step 2: Write the failing test**

Write `apps/desktop/e2e/helpers/__tests__/llm.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLlmMode, requireLlm, type LlmMode } from '../llm';

describe('llm helper', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    delete process.env.SERO_E2E_LLM_MODE;
    delete process.env.SERO_E2E_LLM_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  describe('getLlmMode', () => {
    it('defaults to "off" when no env is set', () => {
      expect(getLlmMode()).toBe<LlmMode>('off');
    });

    it('reads "cheap" from SERO_E2E_LLM_MODE', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(getLlmMode()).toBe<LlmMode>('cheap');
    });

    it('reads "full" from SERO_E2E_LLM_MODE', () => {
      process.env.SERO_E2E_LLM_MODE = 'full';
      expect(getLlmMode()).toBe<LlmMode>('full');
    });

    it('throws on invalid mode rather than silently falling back', () => {
      process.env.SERO_E2E_LLM_MODE = 'medium';
      expect(() => getLlmMode()).toThrow(/SERO_E2E_LLM_MODE/);
    });
  });

  describe('requireLlm', () => {
    it('returns a Playwright-compatible skip object when mode is "off"', () => {
      const result = requireLlm();
      expect(result.skip).toBe(true);
      expect(result.reason).toMatch(/SERO_E2E_LLM_MODE=off/);
    });

    it('returns skip:false when mode is "cheap"', () => {
      process.env.SERO_E2E_LLM_MODE = 'cheap';
      expect(requireLlm()).toEqual({ skip: false });
    });

    it('returns skip:false when mode is "full"', () => {
      process.env.SERO_E2E_LLM_MODE = 'full';
      expect(requireLlm()).toEqual({ skip: false });
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/llm.test.ts
```

Expected: vitest reports `Cannot find module '../llm'` (module not yet created).

- [ ] **Step 4: Implement the helper**

Write `apps/desktop/e2e/helpers/llm.ts`:

```ts
export type LlmMode = 'off' | 'cheap' | 'full';

const VALID_MODES: ReadonlyArray<LlmMode> = ['off', 'cheap', 'full'];

export function getLlmMode(): LlmMode {
  const raw = process.env.SERO_E2E_LLM_MODE;
  if (raw === undefined || raw === '') return 'off';
  if ((VALID_MODES as ReadonlyArray<string>).includes(raw)) {
    return raw as LlmMode;
  }
  throw new Error(
    `Invalid SERO_E2E_LLM_MODE="${raw}". Expected one of: ${VALID_MODES.join(', ')}.`,
  );
}

export interface RequireLlmResult {
  skip: boolean;
  reason?: string;
}

export function requireLlm(): RequireLlmResult {
  const mode = getLlmMode();
  if (mode === 'off') {
    return {
      skip: true,
      reason: 'SERO_E2E_LLM_MODE=off — agent-realism tests skipped. Set to "cheap" or "full" to enable.',
    };
  }
  return { skip: false };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/llm.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/vitest.config.ts apps/desktop/e2e/helpers/llm.ts apps/desktop/e2e/helpers/__tests__/llm.test.ts
git commit -m "feat(e2e): add llm-mode helper for agent realism gating"
```

---

## Task 3: Build `helpers/seroHome.ts` with vitest unit tests

**Files:**
- Create: `apps/desktop/e2e/helpers/seroHome.ts`
- Create: `apps/desktop/e2e/helpers/__tests__/seroHome.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/desktop/e2e/helpers/__tests__/seroHome.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTempSeroHome,
  seedProfile,
  seedWorkspace,
  type TempSeroHome,
} from '../seroHome';

describe('seroHome helper', () => {
  const created: TempSeroHome[] = [];

  afterEach(() => {
    while (created.length > 0) {
      const home = created.pop();
      home?.cleanup();
    }
  });

  it('createTempSeroHome creates an empty isolated directory', () => {
    const home = createTempSeroHome();
    created.push(home);
    expect(fs.existsSync(home.path)).toBe(true);
    expect(home.path).toMatch(/sero-e2e-/);
    expect(fs.readdirSync(home.path)).toEqual([]);
  });

  it('two consecutive calls produce distinct directories', () => {
    const a = createTempSeroHome();
    const b = createTempSeroHome();
    created.push(a, b);
    expect(a.path).not.toBe(b.path);
  });

  it('cleanup removes the directory recursively', () => {
    const home = createTempSeroHome();
    fs.writeFileSync(path.join(home.path, 'marker.txt'), 'x');
    home.cleanup();
    expect(fs.existsSync(home.path)).toBe(false);
  });

  it('cleanup is idempotent', () => {
    const home = createTempSeroHome();
    home.cleanup();
    expect(() => home.cleanup()).not.toThrow();
  });

  it('seedProfile writes profiles/registry.json and a default profile dir', () => {
    const home = createTempSeroHome();
    created.push(home);
    const profile = seedProfile(home, { name: 'Test' });
    const registry = JSON.parse(
      fs.readFileSync(path.join(home.path, 'profiles', 'registry.json'), 'utf8'),
    );
    expect(registry.activeProfileId).toBe(profile.id);
    expect(registry.profiles).toHaveLength(1);
    expect(registry.profiles[0].name).toBe('Test');
    expect(fs.existsSync(path.join(home.path, 'profiles', profile.id, 'agent'))).toBe(true);
  });

  it('seedWorkspace writes a workspaces.json entry under the active profile', () => {
    const home = createTempSeroHome();
    created.push(home);
    seedProfile(home, { name: 'Test' });
    const wsPath = path.join(home.path, 'sample-repo');
    fs.mkdirSync(wsPath, { recursive: true });
    const ws = seedWorkspace(home, { path: wsPath, name: 'sample' });
    const wsFile = path.join(home.path, 'profiles', home.activeProfileId!, 'workspaces.json');
    const wsJson = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
    expect(wsJson.workspaces).toHaveLength(1);
    expect(wsJson.workspaces[0].id).toBe(ws.id);
    expect(wsJson.workspaces[0].path).toBe(wsPath);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/seroHome.test.ts
```

Expected: `Cannot find module '../seroHome'`.

- [ ] **Step 3: Implement the helper**

Write `apps/desktop/e2e/helpers/seroHome.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface TempSeroHome {
  path: string;
  activeProfileId: string | null;
  cleanup: () => void;
}

export function createTempSeroHome(): TempSeroHome {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-e2e-'));
  const handle: TempSeroHome = {
    path: dir,
    activeProfileId: null,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return handle;
}

export interface SeededProfile {
  id: string;
  name: string;
  path: string;
}

export interface SeedProfileOpts {
  name: string;
  id?: string;
}

export function seedProfile(home: TempSeroHome, opts: SeedProfileOpts): SeededProfile {
  const id = opts.id ?? randomUUID();
  const profileRoot = path.join(home.path, 'profiles', id);
  fs.mkdirSync(path.join(profileRoot, 'agent'), { recursive: true });

  const registryPath = path.join(home.path, 'profiles', 'registry.json');
  const existing = readJsonIfExists(registryPath, {
    activeProfileId: null as string | null,
    profiles: [] as Array<{ id: string; name: string; path: string }>,
  });
  existing.profiles.push({ id, name: opts.name, path: profileRoot });
  existing.activeProfileId = id;
  fs.writeFileSync(registryPath, JSON.stringify(existing, null, 2));

  home.activeProfileId = id;
  return { id, name: opts.name, path: profileRoot };
}

export interface SeededWorkspace {
  id: string;
  name: string;
  path: string;
}

export interface SeedWorkspaceOpts {
  path: string;
  name: string;
  id?: string;
  runtimeBackend?: 'host' | 'apple-container' | 'docker';
}

export function seedWorkspace(home: TempSeroHome, opts: SeedWorkspaceOpts): SeededWorkspace {
  if (!home.activeProfileId) {
    throw new Error('seedWorkspace requires seedProfile first');
  }
  const id = opts.id ?? randomUUID();
  const wsFile = path.join(home.path, 'profiles', home.activeProfileId, 'workspaces.json');
  const existing = readJsonIfExists(wsFile, {
    workspaces: [] as Array<{
      id: string;
      name: string;
      path: string;
      runtimeBackend: 'host' | 'apple-container' | 'docker';
    }>,
  });
  existing.workspaces.push({
    id,
    name: opts.name,
    path: opts.path,
    runtimeBackend: opts.runtimeBackend ?? 'host',
  });
  fs.writeFileSync(wsFile, JSON.stringify(existing, null, 2));
  return { id, name: opts.name, path: opts.path };
}

function readJsonIfExists<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/seroHome.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Verify shape matches what `electron/platform/env/index.ts` actually reads**

Open `apps/desktop/electron/platform/env/index.ts` and confirm that:

- `SERO_HOME_OVERRIDE` env var causes `resolveSeroHome()` to return that path directly (see line ~131).
- When `SERO_HOME_OVERRIDE` is set, `readPostResolveRegistry()` returns an empty registry (line ~141) — so the seeded `profiles/registry.json` is *only* read when `SERO_HOME_OVERRIDE` is unset.

This means: tests that want the seeded profile to be active must NOT set `SERO_HOME_OVERRIDE`; instead they must set `HOME` (or platform equivalent) so `SERO_FIXED_ROOT` falls inside the temp dir. If verification shows the existing helpers work via `SERO_HOME_OVERRIDE` only (no profile registry), update Task 5's launcher to support a `seedMode: 'override' | 'registry'` distinction. For Phase 0 the existing `SERO_HOME_OVERRIDE` mode is enough; the registry-aware seeding is left in place for Phase 2+ profile tests. Add a short comment to `seroHome.ts` documenting this:

```ts
// NOTE: Seeded profiles/registry.json is only consulted when the app boots
// WITHOUT SERO_HOME_OVERRIDE. Today's launcher uses SERO_HOME_OVERRIDE for
// isolation; profile-switch tests in Phase 2 will need the launcher's
// `seedMode: 'registry'` option (see app launcher extension in Task 5).
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/e2e/helpers/seroHome.ts apps/desktop/e2e/helpers/__tests__/seroHome.test.ts
git commit -m "feat(e2e): add seroHome helper for isolated test homes and profile seeding"
```

---

## Task 4: Build `helpers/runtime.ts` with vitest unit tests

**Files:**
- Create: `apps/desktop/e2e/helpers/runtime.ts`
- Create: `apps/desktop/e2e/helpers/__tests__/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/desktop/e2e/helpers/__tests__/runtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runtimeAvailableOn, runtimeSkipReason, type RuntimeBackend } from '../runtime';

describe('runtime helper', () => {
  describe('runtimeAvailableOn', () => {
    it('host is available on every supported platform', () => {
      expect(runtimeAvailableOn('host', 'darwin')).toBe(true);
      expect(runtimeAvailableOn('host', 'linux')).toBe(true);
      expect(runtimeAvailableOn('host', 'win32')).toBe(true);
    });

    it('apple-container is darwin-only', () => {
      expect(runtimeAvailableOn('apple-container', 'darwin')).toBe(true);
      expect(runtimeAvailableOn('apple-container', 'linux')).toBe(false);
      expect(runtimeAvailableOn('apple-container', 'win32')).toBe(false);
    });

    it('docker is linux-first (macOS/Windows are manual-only in the test matrix)', () => {
      expect(runtimeAvailableOn('docker', 'linux')).toBe(true);
      expect(runtimeAvailableOn('docker', 'darwin')).toBe(false);
      expect(runtimeAvailableOn('docker', 'win32')).toBe(false);
    });
  });

  describe('runtimeSkipReason', () => {
    it('returns null when the backend is available', () => {
      expect(runtimeSkipReason('host', 'darwin')).toBeNull();
      expect(runtimeSkipReason('apple-container', 'darwin')).toBeNull();
    });

    it('returns a human-readable string when the backend is unavailable', () => {
      const reason = runtimeSkipReason('apple-container', 'linux');
      expect(reason).toMatch(/apple-container/);
      expect(reason).toMatch(/linux/);
    });
  });

  it('exports the supported backends list', async () => {
    const mod = await import('../runtime');
    expect(mod.RUNTIME_BACKENDS).toEqual<RuntimeBackend[]>([
      'host',
      'apple-container',
      'docker',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/runtime.test.ts
```

Expected: `Cannot find module '../runtime'`.

- [ ] **Step 3: Implement the helper**

Write `apps/desktop/e2e/helpers/runtime.ts`:

```ts
export type RuntimeBackend = 'host' | 'apple-container' | 'docker';

export const RUNTIME_BACKENDS: RuntimeBackend[] = ['host', 'apple-container', 'docker'];

export type SupportedPlatform = 'darwin' | 'linux' | 'win32';

const AVAILABILITY: Record<RuntimeBackend, ReadonlyArray<SupportedPlatform>> = {
  host: ['darwin', 'linux', 'win32'],
  'apple-container': ['darwin'],
  docker: ['linux'],
};

export function runtimeAvailableOn(
  backend: RuntimeBackend,
  platform: SupportedPlatform = process.platform as SupportedPlatform,
): boolean {
  return AVAILABILITY[backend].includes(platform);
}

export function runtimeSkipReason(
  backend: RuntimeBackend,
  platform: SupportedPlatform = process.platform as SupportedPlatform,
): string | null {
  if (runtimeAvailableOn(backend, platform)) return null;
  return `Runtime "${backend}" is not exercised on platform "${platform}" in the test matrix.`;
}

export function currentRuntimeFromEnv(): RuntimeBackend | undefined {
  const raw = process.env.SERO_E2E_RUNTIME;
  if (!raw) return undefined;
  if ((RUNTIME_BACKENDS as string[]).includes(raw)) return raw as RuntimeBackend;
  throw new Error(
    `Invalid SERO_E2E_RUNTIME="${raw}". Expected one of: ${RUNTIME_BACKENDS.join(', ')}.`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/runtime.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/e2e/helpers/runtime.ts apps/desktop/e2e/helpers/__tests__/runtime.test.ts
git commit -m "feat(e2e): add runtime-backend availability helper"
```

---

## Task 5: Extend `launchSeroApp` with new options

**Files:**
- Modify: `apps/desktop/e2e/helpers/electron-app.ts`

- [ ] **Step 1: Read the file to confirm current shape**

```bash
cat apps/desktop/e2e/helpers/electron-app.ts | head -75
```

Expected: confirms current `LaunchOptions` has `env`, `seroHome`, `containers`. Default `seroHome` is `path.join(desktopRoot, '.sero-test-data')`.

- [ ] **Step 2: Add the runtime imports at the top of the file**

In `apps/desktop/e2e/helpers/electron-app.ts`, just below the existing `import path from 'path';` line, add:

```ts
import type { RuntimeBackend } from './runtime';
import { runtimeAvailableOn } from './runtime';
```

- [ ] **Step 3: Replace the `LaunchOptions` interface**

Replace the existing `LaunchOptions` interface (currently the JSDoc block + interface starting around line 6) with:

```ts
/**
 * Options for launching the Sero Electron app in tests.
 */
export interface LaunchOptions {
  /** Extra environment variables merged into the Electron process. */
  env?: Record<string, string>;
  /** Override the SERO_HOME directory (defaults to a temp dir). */
  seroHome?: string;
  /**
   * Runtime backend to exercise. Sets SERO_E2E_RUNTIME for downstream
   * code and toggles the legacy SERO_CONTAINER_PROXY flag accordingly:
   *   - 'host'            → proxy disabled
   *   - 'apple-container' → proxy enabled (requires macOS Virtualization)
   *   - 'docker'          → proxy enabled (requires Docker daemon on Linux)
   *
   * Defaults to 'host' when omitted. Specs that require an unavailable
   * runtime on the current platform should use the runtime helper to skip.
   */
  runtime?: RuntimeBackend;
  /**
   * @deprecated Prefer `runtime`. When set, `runtime` wins.
   * Kept temporarily so unmigrated specs still launch.
   */
  containers?: boolean;
  /**
   * Optional seeder run after the temp SERO_HOME is created but BEFORE
   * Electron launches. Receives the resolved SERO_HOME path so the
   * seeder can write profiles/, workspaces.json, auth.json, etc.
   */
  seed?: (seroHome: string) => void | Promise<void>;
  /**
   * Intercept `app.relaunch()` / `app.exit()` calls so profile-switch
   * tests can assert the call was made without actually relaunching.
   * The intercepted call is exposed via `__seroRelaunchCalls` on the
   * main-process global for in-test assertions.
   */
  mockRelaunch?: boolean;
}
```

- [ ] **Step 4: Update `launchSeroApp` to honour the new options**

Replace the body of `launchSeroApp` (the function definition and its body, currently roughly lines 32–73) with:

```ts
export async function launchSeroApp(
  options: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const desktopRoot = path.resolve(__dirname, '../..');
  const mainEntry = path.join(desktopRoot, 'dist/electron/main.mjs');

  const runtime: RuntimeBackend =
    options.runtime ?? (options.containers ? 'apple-container' : 'host');

  if (!runtimeAvailableOn(runtime, process.platform as 'darwin' | 'linux' | 'win32')) {
    throw new Error(
      `launchSeroApp: runtime "${runtime}" is not available on platform "${process.platform}". ` +
        'Spec authors should call runtimeSkipReason() and test.skip() before reaching the launcher.',
    );
  }

  const seroHome = options.seroHome ?? path.join(desktopRoot, '.sero-test-data');

  if (options.seed) {
    await options.seed(seroHome);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    SERO_HOME_OVERRIDE: seroHome,
    SERO_E2E_RUNTIME: runtime,
  };

  if (runtime === 'host') {
    env.SERO_CONTAINER_PROXY = '0';
  }

  if (options.mockRelaunch) {
    env.SERO_E2E_MOCK_RELAUNCH = '1';
  }

  Object.assign(env, options.env);

  const app = await electron.launch({
    args: [mainEntry],
    cwd: desktopRoot,
    env,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  if (options.mockRelaunch) {
    await app.evaluate(({ app: electronApp }) => {
      const calls: Array<{ method: 'relaunch' | 'exit'; args: unknown[] }> = [];
      (globalThis as Record<string, unknown>).__seroRelaunchCalls = calls;
      const originalRelaunch = electronApp.relaunch.bind(electronApp);
      const originalExit = electronApp.exit.bind(electronApp);
      electronApp.relaunch = ((...args: unknown[]) => {
        calls.push({ method: 'relaunch', args });
      }) as typeof electronApp.relaunch;
      electronApp.exit = ((...args: unknown[]) => {
        calls.push({ method: 'exit', args });
      }) as typeof electronApp.exit;
      void originalRelaunch;
      void originalExit;
    });
  }

  return { app, page };
}
```

- [ ] **Step 5: Run the desktop typecheck**

```bash
pnpm --filter @sero/desktop typecheck
```

Expected: clean (no errors). If `containers` is referenced elsewhere in `helpers/index.ts` or specs, leave those references — they still work via the deprecated path.

- [ ] **Step 6: Sanity-launch the app via the new options**

This is the integration validation — no separate test file, since the existing migrated specs in Task 11 will exercise it. As a one-off smoke before continuing, run:

```bash
pnpm --filter @sero/desktop build
node --input-type=module -e "
import { launchSeroApp } from './apps/desktop/e2e/helpers/electron-app.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-e2e-smoke-'));
const { app } = await launchSeroApp({ seroHome: home, runtime: 'host' });
console.log('launched ok with seroHome=', home);
await app.close();
fs.rmSync(home, { recursive: true, force: true });
"
```

Expected: prints `launched ok with seroHome= /var/folders/.../sero-e2e-smoke-XXXX` and exits 0. (If the import path differs once compiled, adjust to the actual emitted file.)

If this step is impractical because helpers aren't transpiled standalone, skip it — Task 11's migrated specs are the real validation gate.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/e2e/helpers/electron-app.ts
git commit -m "feat(e2e): extend launchSeroApp with runtime, seed, and mockRelaunch options"
```

---

## Task 6: Re-export new helpers from `helpers/index.ts`

**Files:**
- Modify: `apps/desktop/e2e/helpers/index.ts`

- [ ] **Step 1: Read current exports**

```bash
cat apps/desktop/e2e/helpers/index.ts
```

Expected: 2 lines re-exporting `electron-app` symbols and `selectors`.

- [ ] **Step 2: Replace with extended exports**

Write `apps/desktop/e2e/helpers/index.ts`:

```ts
export { launchSeroApp, getWindowTitle, isWindowVisible } from './electron-app';
export type { LaunchOptions } from './electron-app';
export { layout, sidebar, chat, vcs, workspace, fileTree } from './selectors';
export {
  createTempSeroHome,
  seedProfile,
  seedWorkspace,
  type TempSeroHome,
  type SeededProfile,
  type SeededWorkspace,
  type SeedProfileOpts,
  type SeedWorkspaceOpts,
} from './seroHome';
export {
  RUNTIME_BACKENDS,
  runtimeAvailableOn,
  runtimeSkipReason,
  currentRuntimeFromEnv,
  type RuntimeBackend,
  type SupportedPlatform,
} from './runtime';
export { getLlmMode, requireLlm, type LlmMode, type RequireLlmResult } from './llm';
```

- [ ] **Step 3: Run the desktop typecheck**

```bash
pnpm --filter @sero/desktop typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/e2e/helpers/index.ts
git commit -m "feat(e2e): re-export seroHome/runtime/llm helpers from helpers/index"
```

---

## Task 7: Create fixtures directory scaffold

**Files:**
- Create: `apps/desktop/e2e/fixtures/.gitkeep`

- [ ] **Step 1: Create the directory and placeholder**

```bash
mkdir -p apps/desktop/e2e/fixtures
```

Write `apps/desktop/e2e/fixtures/.gitkeep`:

```
Placeholder. Real fixtures land here in later phases:
  - test-plugin/        (Phase 3 — synthetic plugin)
  - test-mcp-server/    (Phase 3 — minimal MCP server)
  - repos/              (Phase 2 — pre-baked git repos for VCS tests)
  - corrupt/            (Phase 2 — broken workspaces.json + jsonl for resilience tests)
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/e2e/fixtures/.gitkeep
git commit -m "chore(e2e): scaffold fixtures directory"
```

---

## Task 8: Add `scripts/e2e-doctor.sh`

**Files:**
- Create: `apps/desktop/scripts/e2e-doctor.sh`

- [ ] **Step 1: Write the script**

Write `apps/desktop/scripts/e2e-doctor.sh`:

```bash
#!/usr/bin/env bash
# e2e-doctor: verify machine prerequisites for the Sero e2e suite.
#
# Exits 0 if the requested layer can run, 1 otherwise. The layer is the
# first positional arg ("contract" | "workflow" | "agent" | "all").
# Defaults to "all". Output is human-readable; consume from terminals.

set -euo pipefail

LAYER="${1:-all}"
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=1; }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then ok "$1 ($(command -v "$1"))"
  else bad "missing: $1"
  fi
}

section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

section "Core (all layers)"
require_cmd node
require_cmd pnpm
require_cmd npx
require_cmd git

OS="$(uname -s)"
ok "OS: $OS"

if [[ "$LAYER" == "workflow" || "$LAYER" == "all" ]]; then
  section "Workflow layer"
  case "$OS" in
    Darwin)
      if command -v container >/dev/null 2>&1; then ok "apple container runtime"
      else warn "container binary missing — apple-container tests will skip"
      fi
      ;;
    Linux)
      require_cmd docker
      if [[ -n "${DISPLAY:-}" ]] || command -v xvfb-run >/dev/null 2>&1; then
        ok "display available (\$DISPLAY or xvfb-run)"
      else
        bad "no \$DISPLAY and no xvfb-run — Electron UI won't render"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      ok "Git Bash detected"
      ;;
    *)
      warn "unrecognised OS \"$OS\" — workflow layer support is best-effort"
      ;;
  esac
fi

if [[ "$LAYER" == "agent" || "$LAYER" == "all" ]]; then
  section "Agent layer"
  if [[ -f "apps/desktop/e2e/.env.test" ]]; then ok ".env.test present"
  else warn ".env.test missing — copy from .env.test.example and add an API key"
  fi
  if [[ "${SERO_E2E_LLM_MODE:-off}" != "off" ]]; then
    ok "SERO_E2E_LLM_MODE=${SERO_E2E_LLM_MODE}"
  else
    warn "SERO_E2E_LLM_MODE unset or 'off' — agent tests will skip"
  fi
fi

printf '\n'
if [[ $FAIL -eq 0 ]]; then
  ok "ready: e2e $LAYER"
  exit 0
else
  bad "not ready — fix the above and re-run"
  exit 1
fi
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x apps/desktop/scripts/e2e-doctor.sh
```

- [ ] **Step 3: Run it as a smoke check**

```bash
apps/desktop/scripts/e2e-doctor.sh contract
```

Expected: exit 0 on the maintainer's Mac; output shows core tool detection.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/scripts/e2e-doctor.sh
git commit -m "feat(e2e): add e2e-doctor.sh to verify per-layer machine prerequisites"
```

---

## Task 9: Restructure `playwright.config.ts` to 3 projects

**Files:**
- Modify: `apps/desktop/playwright.config.ts`

- [ ] **Step 1: Replace the config**

Write `apps/desktop/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

/**
 * Three Playwright projects matching the e2e coverage architecture:
 *
 *   - "contract" — IPC surface, CLI registry, manifest parsing, runtime
 *                  selection. Runs on every PR (GitHub-hosted runners).
 *                  Target wall-clock: ~1–2 min.
 *
 *   - "workflow" — Full user journeys driven through the rendered
 *                  Electron UI. Runs on self-hosted runners per OS via
 *                  workflow_dispatch. Target wall-clock: ~10–15 min.
 *
 *   - "agent"    — Real LLM round-trips on a small set of canonical
 *                  flows. Runs nightly (cheap) and on-demand (full).
 *                  Skipped entirely when SERO_E2E_LLM_MODE=off (default).
 *
 * Spec routing is by filename suffix:
 *   *.contract.spec.ts → contract
 *   *.workflow.spec.ts → workflow
 *   *.agent.spec.ts    → agent
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* Fail the build on CI if you accidentally left test.only in source. */
  forbidOnly: !!process.env.CI,

  /* Single soft retry on agent flake; contract/workflow only retry on CI. */
  retries: process.env.CI ? 1 : 0,

  /* Electron is single-instance; never parallelise. */
  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],

  /* Container specs need extra time for image pull / boot. */
  timeout: 120_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'contract',
      testMatch: '**/*.contract.spec.ts',
      metadata: { layer: 'contract' },
    },
    {
      name: 'workflow',
      testMatch: '**/*.workflow.spec.ts',
      metadata: { layer: 'workflow' },
    },
    {
      name: 'agent',
      testMatch: '**/*.agent.spec.ts',
      metadata: { layer: 'agent' },
    },
  ],
});
```

- [ ] **Step 2: Verify the config parses**

```bash
cd apps/desktop && npx playwright test --list --project=contract && cd -
```

Expected at this point: error like `No tests found` (the spec files haven't been renamed yet) — confirms the config parses and the project filter works. If Playwright complains about the config syntax itself, fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/playwright.config.ts
git commit -m "feat(e2e): replace ci/local Playwright projects with contract/workflow/agent"
```

---

## Task 10: Replace package.json e2e scripts

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `package.json` (repo root)

- [ ] **Step 1: Read current scripts**

```bash
sed -n '/"scripts":/,/}/p' apps/desktop/package.json | head -20
```

Expected: shows current `test:e2e`, `test:e2e:ci`, `test:e2e:local`, `test:e2e:headed`.

- [ ] **Step 2: Replace e2e scripts in `apps/desktop/package.json`**

Open `apps/desktop/package.json` and replace the four `test:e2e*` lines with:

```json
    "e2e": "npm run build && npx playwright test",
    "e2e:contract": "npm run build && npx playwright test --project=contract",
    "e2e:workflow": "npm run build && npx playwright test --project=workflow",
    "e2e:agent": "npm run build && npx playwright test --project=agent",
    "e2e:headed": "npm run build && npx playwright test --project=workflow --headed",
    "e2e:doctor": "bash scripts/e2e-doctor.sh",
```

Keep the rest of the scripts block unchanged.

- [ ] **Step 3: Update root `package.json`**

In repo-root `package.json`, replace the existing `test:e2e` and `test:ci` scripts. Find:

```json
    "test:e2e": "pnpm --filter @sero/desktop test:e2e",
    "test:ci": "pnpm typecheck && pnpm build && pnpm test && pnpm --filter @sero/desktop test:e2e:ci",
```

Replace with:

```json
    "e2e": "pnpm --filter @sero/desktop e2e",
    "e2e:contract": "pnpm --filter @sero/desktop e2e:contract",
    "e2e:workflow": "pnpm --filter @sero/desktop e2e:workflow",
    "e2e:agent": "pnpm --filter @sero/desktop e2e:agent",
    "test:ci": "pnpm typecheck && pnpm build && pnpm test && pnpm e2e:contract",
```

- [ ] **Step 4: Check for callers of the removed script names**

```bash
git grep -nE "test:e2e(:ci|:local|:headed)?\b" -- ':!**/CHANGELOG.md' ':!**/*.lock'
```

Expected: only `.github/workflows/test.yml` may reference them. If so:

```bash
cat .github/workflows/test.yml
```

Update any references from `test:e2e:ci` → `e2e:contract` (the closest semantic equivalent — runs in headless/CI). If the workflow already invokes `npm run test:e2e:ci`, change to `npm run e2e:contract`.

- [ ] **Step 5: Smoke check at least one of the new scripts resolves**

```bash
pnpm --filter @sero/desktop run --help e2e:doctor
```

Expected: shows the script definition. Then:

```bash
pnpm --filter @sero/desktop e2e:doctor contract
```

Expected: exits 0 (uses Task 8's script).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json package.json .github/workflows/test.yml
git commit -m "feat(e2e): replace test:e2e scripts with e2e/e2e:{contract,workflow,agent}"
```

---

## Task 11: Migrate existing specs to the new naming convention

**Files** (creates/renames; see migration table at top of plan):
- Rename: `apps/desktop/e2e/container.spec.ts` → `container.workflow.spec.ts`
- Rename: `apps/desktop/e2e/file-tree.spec.ts` → `file-tree.workflow.spec.ts`
- Rename: `apps/desktop/e2e/layout.spec.ts` → `layout.workflow.spec.ts`
- Rename: `apps/desktop/e2e/scroll-fix.spec.ts` → `scroll-fix.workflow.spec.ts`
- Rename: `apps/desktop/e2e/vcs.spec.ts` → `vcs.workflow.spec.ts`
- Rename: `apps/desktop/e2e/memory.spec.ts` → `memory.contract.spec.ts`
- Rename: `apps/desktop/e2e/memory-snapshot.spec.ts` → `memory-snapshot.contract.spec.ts`
- Split: `apps/desktop/e2e/agent.spec.ts` → `agent-ipc.contract.spec.ts` + `agent-ui.workflow.spec.ts`
- Split: `apps/desktop/e2e/app-launch.spec.ts` → `app-launch.contract.spec.ts` + `app-shell.workflow.spec.ts`

- [ ] **Step 1: Confirm the current spec inventory**

```bash
ls apps/desktop/e2e/*.spec.ts
```

Expected: the 8 files listed above (the two split sources count as one each).

- [ ] **Step 2: Rename the 7 single-project specs**

```bash
git mv apps/desktop/e2e/container.spec.ts       apps/desktop/e2e/container.workflow.spec.ts
git mv apps/desktop/e2e/file-tree.spec.ts       apps/desktop/e2e/file-tree.workflow.spec.ts
git mv apps/desktop/e2e/layout.spec.ts          apps/desktop/e2e/layout.workflow.spec.ts
git mv apps/desktop/e2e/scroll-fix.spec.ts      apps/desktop/e2e/scroll-fix.workflow.spec.ts
git mv apps/desktop/e2e/vcs.spec.ts             apps/desktop/e2e/vcs.workflow.spec.ts
git mv apps/desktop/e2e/memory.spec.ts          apps/desktop/e2e/memory.contract.spec.ts
git mv apps/desktop/e2e/memory-snapshot.spec.ts apps/desktop/e2e/memory-snapshot.contract.spec.ts
```

- [ ] **Step 3: Split `agent.spec.ts`**

Read the existing file once:

```bash
cat apps/desktop/e2e/agent.spec.ts
```

Inspect: the file contains an `Agent - Session Management` describe block (IPC-only) and an `Agent - Chat Input` describe block (UI, currently `test.skip(() => !!process.env.CI, …)`).

Create `apps/desktop/e2e/agent-ipc.contract.spec.ts` containing the imports, the top-level `beforeAll`/`afterAll`, and the `Agent - Session Management` describe block (and only that). Header doc comment:

```ts
/**
 * Agent IPC contract tests.
 *
 * Project: contract. Exercises the agent-related IPC surface
 * (workspaces.list, sessions.create, sessions.list) without
 * touching the rendered UI.
 */
```

Create `apps/desktop/e2e/agent-ui.workflow.spec.ts` containing the imports, the top-level `beforeAll`/`afterAll`, and the `Agent - Chat Input` describe block. Drop the `test.skip(() => !!process.env.CI, …)` line — the workflow project never runs on headless GH-hosted runners, so the guard is redundant. Header doc:

```ts
/**
 * Agent chat UI workflow tests.
 *
 * Project: workflow. Drives the chat input panel end-to-end:
 * open the chat, type a message, observe streaming state.
 * Requires a rendered Electron window — runs only via the
 * workflow project on macOS (host) or apple-container.
 */
```

Then remove the original:

```bash
git rm apps/desktop/e2e/agent.spec.ts
```

- [ ] **Step 4: Split `app-launch.spec.ts`**

Read the file:

```bash
cat apps/desktop/e2e/app-launch.spec.ts
```

It contains an `App Launch` describe block. The first two tests (`should create a visible window`, `should set the correct window title`) are pure main-process IPC and pass headlessly. The remaining tests (`should render the main app shell`, `… render the title bar`, `… render the status bar`, `… have the sidebar toggle button`, `… have the chat panel toggle button`) each call `test.skip(!!process.env.CI, …)` because they need a rendered window.

Create `apps/desktop/e2e/app-launch.contract.spec.ts` containing the imports, the top-level `beforeAll`/`afterAll`, and a single `App Launch` describe block with only the first two tests. Header:

```ts
/**
 * App launch contract tests.
 *
 * Project: contract. Verifies the Electron main process boots,
 * a BrowserWindow is created, and the window title is populated.
 * No UI rendering assumptions.
 */
```

Create `apps/desktop/e2e/app-shell.workflow.spec.ts` containing the imports, the top-level `beforeAll`/`afterAll`, and a single `App Shell` describe block with the five UI rendering tests. Drop each `test.skip(!!process.env.CI, …)` line. Header:

```ts
/**
 * App shell rendering workflow tests.
 *
 * Project: workflow. Asserts the main shell, title bar, status
 * bar, and toggle buttons render. Requires a real Electron
 * window — runs only via the workflow project.
 */
```

Then remove the original:

```bash
git rm apps/desktop/e2e/app-launch.spec.ts
```

- [ ] **Step 5: Verify each Playwright project picks up the right specs**

```bash
cd apps/desktop && npx playwright test --list --project=contract && cd -
```

Expected: lists tests from `agent-ipc.contract.spec.ts`, `app-launch.contract.spec.ts`, `memory.contract.spec.ts`, `memory-snapshot.contract.spec.ts`.

```bash
cd apps/desktop && npx playwright test --list --project=workflow && cd -
```

Expected: lists tests from `agent-ui.workflow.spec.ts`, `app-shell.workflow.spec.ts`, `container.workflow.spec.ts`, `file-tree.workflow.spec.ts`, `layout.workflow.spec.ts`, `scroll-fix.workflow.spec.ts`, `vcs.workflow.spec.ts`.

```bash
cd apps/desktop && npx playwright test --list --project=agent && cd -
```

Expected: `No tests found` (intentional — agent specs arrive in Phase 4).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/e2e/
git commit -m "refactor(e2e): rename existing specs and split agent/app-launch into contract+workflow"
```

---

## Task 12: Run the migrated suites locally and fix fallout

**Files:** (no edits expected; fixes applied as discovered)

- [ ] **Step 1: Build the desktop app**

```bash
pnpm --filter @sero/desktop build
```

Expected: clean build.

- [ ] **Step 2: Run the contract suite**

```bash
pnpm --filter @sero/desktop e2e:contract
```

Expected: green. The contract suite includes `app-launch.contract`, `agent-ipc.contract`, `memory.contract`, `memory-snapshot.contract` — none should be skipped (no `process.env.CI` gates remain in these tests since the layer is designed for headless).

If anything fails, the most likely cause is a residual `test.skip(!!process.env.CI, …)` line or an IPC method that needs a workspace to be seeded. For the former, remove the guard. For the latter, add a `seed: (home) => seedProfile(...) + seedWorkspace(...)` option to the `launchSeroApp` call at the top of the failing spec, using the helpers from Task 3.

- [ ] **Step 3: Run the workflow suite for `host` runtime**

```bash
SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow
```

Expected: green except for `container.workflow.spec.ts` (which requires apple-container). The container spec should skip itself when it sees the wrong runtime — add a guard at the top of the file if missing:

```ts
import { runtimeSkipReason } from './helpers';
test.skip(
  runtimeSkipReason('apple-container') !== null,
  'container.workflow.spec.ts requires the apple-container runtime',
);
```

(If the spec already early-returns based on platform, leave it alone.)

- [ ] **Step 4: Run the workflow suite for `apple-container` runtime**

```bash
SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow
```

Expected: green. `container.workflow.spec.ts` should now exercise the full container lifecycle (matching today's `local` project behaviour).

If `container.workflow.spec.ts` still calls `launchSeroApp({ containers: true })`, update to `launchSeroApp({ runtime: 'apple-container' })` — the deprecated `containers` flag still works (Task 5 maps it), but the migrated spec should use the new option for clarity.

- [ ] **Step 5: Run the agent suite (expected empty)**

```bash
pnpm --filter @sero/desktop e2e:agent
```

Expected: Playwright prints `No tests found` and exits 0. (Playwright treats no-matching-tests as an error by default; if exit is non-zero, add `--pass-with-no-tests` to the `e2e:agent` script in `apps/desktop/package.json` and re-commit Task 10's file with that flag.)

- [ ] **Step 6: Run the helper unit tests one more time**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__
```

Expected: all 20 unit tests across `llm`, `seroHome`, `runtime` pass.

- [ ] **Step 7: Commit any fallout fixes**

```bash
git add -A
git status
```

If the diff is empty, nothing to commit. Otherwise:

```bash
git commit -m "fix(e2e): adjust migrated specs for new runtime/seed launcher options"
```

---

## Task 13: Final verification and PR

**Files:** (no edits; verification + PR)

- [ ] **Step 1: Typecheck the desktop package**

```bash
pnpm --filter @sero/desktop typecheck
```

Expected: clean.

- [ ] **Step 2: Run the desktop vitest suite end-to-end**

```bash
pnpm --filter @sero/desktop test
```

Expected: pre-existing tests pass plus the 20 new helper tests. No regressions.

- [ ] **Step 3: Re-run the three e2e suites one final time**

```bash
pnpm --filter @sero/desktop e2e:contract \
  && SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow \
  && pnpm --filter @sero/desktop e2e:agent
```

Expected: all three exit 0. This is the Phase 0 exit-criterion check.

- [ ] **Step 4: Review commit log**

```bash
git log --oneline main..HEAD
```

Expected: 11 atomic commits (one per Task 1–11) plus any fix commits from Tasks 12–13.

- [ ] **Step 5: Push branch and open PR**

Confirm with the user before pushing or opening the PR; this is a shared-state action that should be authorized in context. Suggested PR title and body:

Title: `feat(e2e): Phase 0 — 3-project Playwright restructure + foundational helpers`

Body:

```
## Summary
- Replaces the ci/local Playwright projects with contract/workflow/agent, routed by file-suffix.
- Ships foundational helpers: seroHome (isolated temp homes + profile/workspace seeding), runtime (backend availability), llm (mode gating for agent realism).
- Extends launchSeroApp with runtime, seed, and mockRelaunch options; old `containers` flag preserved as deprecated alias.
- Migrates the 8 existing specs into the new structure; splits agent.spec.ts and app-launch.spec.ts so contract/workflow assignments are clean.
- Adds scripts/e2e-doctor.sh for per-layer prerequisite checks.

This is Phase 0 of the e2e coverage expansion (see docs/superpowers/specs/2026-05-17-e2e-test-coverage-design.md). No new test scenarios are introduced — the exit criterion is "existing specs still pass under the new structure".

## Test plan
- [ ] `pnpm --filter @sero/desktop typecheck`
- [ ] `pnpm --filter @sero/desktop test` (vitest, including 20 new helper tests)
- [ ] `pnpm --filter @sero/desktop e2e:contract`
- [ ] `SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow`
- [ ] `pnpm --filter @sero/desktop e2e:agent` (expected: no tests, exit 0)
```

---

## Spec coverage notes

Phase 0 from the spec covers: helpers, fixtures scaffold, 3-project Playwright config, and the "existing specs still pass under new structure" exit criterion. This plan implements all of that. The following spec items are intentionally deferred to later phase plans, with rationale:

- **`helpers/agent.ts`, `helpers/cli.ts`, `helpers/assertions.ts`** — no Phase 0 consumer. Adding them now risks half-finished implementations. They land in the first plan that needs them (Phase 1 for `cli.ts`, Phase 2 for `agent.ts` + `assertions.ts`).
- **Fixtures `test-plugin/`, `test-mcp-server/`, `repos/`, `corrupt/`** — only `fixtures/.gitkeep` ships in Phase 0; real content arrives in Phase 2 (`repos/`, `corrupt/`) and Phase 3 (the synthetic plugin + MCP server).
- **`build-test-plugin.sh`, `regenerate-fixtures.sh`** — Phase 3.
- **`pnpm e2e` interactive picker** — nice-to-have, deferred until two or more layers are in routine use.
- **CI workflows (`e2e-contract.yml`, `e2e-workflow.yml`, `e2e-agent.yml`)** — Phase 1 introduces `e2e-contract.yml`; the other two arrive with Phases 2 and 4 respectively.
- **`data-testid` selector audit** — only adjustments that the migration actually needs (e.g., dropping `process.env.CI` guards in split specs); the broader audit happens as workflow tests are added in Phase 2.
- **Selectors helper additions** — same rationale.
