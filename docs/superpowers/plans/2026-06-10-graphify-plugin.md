# sero-graphify-plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in global Sero plugin that builds Graphify knowledge graphs of every opted-in workspace in the active profile, merges them into a profile-wide graph, and exposes graph search tools + auto-context to agent sessions, working identically for host-mode and container workspaces.

**Architecture:** All Python/Graphify execution happens host-side in the plugin's single global background runtime (Electron main process), provisioned via `uv` (new managed toolchain tool). Graph artifacts live under `SERO_HOME/apps/graphify/`. Queries are answered by a TypeScript graph engine over `graph.json` in the Pi extension — no Python at query time, works in containers.

**Tech Stack:** TypeScript, Pi extension SDK (`@earendil-works/pi-ai`, typebox), `@sero-ai/common` runtime contracts, React + `@sero-ai/ui` + Module Federation (UI), vitest, Python `graphifyy` CLI via `uv`.

**Spec:** `docs/superpowers/specs/2026-06-10-graphify-plugin-design.md`

---

## Context primer (read first)

Facts about this codebase you need:

- **Monorepo:** pnpm. Desktop app: `apps/desktop` (Electron; main-process code in `apps/desktop/electron/`). Shared contracts: `packages/common`. Built-in plugins: `plugins/sero-*-plugin/`.
- **Reference implementation to clone from (do NOT add as dependency):**
  `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-graphify` — a Pi extension wrapping the graphify CLI. We reuse its bounded-exec discipline, stat-parsing regexes, and auto-context modules.
- **Global plugin runtimes:** a plugin with `sero.app.scope: "global"` and `sero.app.runtime` gets exactly ONE background runtime instance in the Electron main process (see `apps/desktop/electron/features/apps/runtime/manager.ts` `buildTargets()` — global manifests pair only with the `global` workspace). Its `ctx.stateFilePath` is the manifest `globalStatePath` (`<SERO_HOME>/apps/<id>/state.json`).
- **Runtime modules** are esbuild-transpiled and may only import `@sero-ai/common` types + node builtins + bundled plugin code — never `@electron/*` internals. They reach host features via `ctx.host.*` capabilities created in `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`.
- **Workspace files always live on the host.** Container workspaces bind-mount them. `WorkspaceInfo` (`apps/desktop/src/types/ipc.ts:52`) has `id`, `name`, `path` (absolute host path), `open`.
- **Managed toolchain:** `apps/desktop/electron/features/workspace/runtime/toolchains/` — `types.ts` (ToolName union, ArtifactSpec), `manifest.ts` (TOOL_NAMES validation), `verifiers.ts` (TOOL_PROBES), `system-candidates.ts`, `generated-artifacts.json` (committed artifact metadata), `manager.ts` (`ToolchainManager.ensure(tool, reason)`). Resolution prefers compatible system tools before managed installs. Docs: `docs/features/host-toolchain.md`.
- **Plugin conventions:** see the sero-plugin skill (`.claude/skills/sero-plugin/SKILL.md`) and `plugins/sero-admin-plugin/` (global-scope example). Plugin tests run with vitest (`pnpm --filter @sero-ai/plugin-graphify test`). Desktop typecheck: `pnpm --filter @sero/desktop typecheck`. Common typecheck: `pnpm --filter @sero-ai/common typecheck`.
- **State files are the bus:** UI/extension/runtime share one JSON state file; host watches it and delivers changes to the runtime via `handleStateChange`. Always write atomically (temp file → `fs.rename`).
- **New host APIs added by this plan ride under the existing `appRuntime.background` capability** — they are only reachable from background runtimes, so no new capability names are introduced.

## File structure

```
packages/common/src/app-runtime-background.ts      # modify: workspace.list, credentials, toolchains APIs
apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts   # modify: wire new APIs
apps/desktop/electron/features/apps/runtime/capabilities/provider-credentials.ts  # create
apps/desktop/electron/features/workspace/runtime/toolchains/{types,manifest,verifiers,system-candidates}.ts  # modify: add 'uv'
apps/desktop/electron/features/workspace/runtime/toolchains/generated-artifacts.json  # modify: uv artifacts

plugins/sero-graphify-plugin/
├── package.json
├── vite.config.ts
├── shared/
│   ├── types.ts                 # state shape + DEFAULT_STATE
│   ├── paths.ts                 # SERO_HOME-relative path resolution (ext + runtime)
│   ├── state-io.ts              # atomic read/write of state.json (extension side)
│   └── query-engine/
│       ├── graph-loader.ts      # node-link graph.json → indexed KnowledgeGraph
│       ├── traverse.ts          # seeds, BFS/DFS, shortest path, neighborhood
│       ├── format.ts            # budgeted text rendering
│       └── index.ts             # queryGraph / findPath / explainNode
├── extension/
│   ├── index.ts                 # tool registration
│   ├── current-workspace.ts     # cwd/env → workspace entry resolution
│   ├── auto-context/            # ported from pi-graphify src/auto-context/
│   └── tsconfig.json
├── runtime/
│   ├── index.ts                 # createAppRuntime wiring
│   ├── host-adapter.ts          # ctx.host → IndexerHost binding
│   ├── indexer.ts               # queue, requests, refresh loop
│   ├── provisioner.ts           # uv → graphifyy install
│   ├── graphify-runner.ts       # build/update/merge + stat parsing
│   ├── credentials.ts           # backend → provider env mapping
│   ├── bounded-exec.ts          # capped spawn
│   └── tsconfig.json
└── ui/
    ├── GraphifyApp.tsx
    ├── styles.css, index.html, tsconfig.json, vite-env.d.ts
```

Each `*.ts` in `shared/` and `runtime/` gets a sibling `*.test.ts`.

---

### Task 1: Spike — verify graphify CLI behavior and pin versions

No code changes; results gate later tasks. Requires network + an Anthropic key (or use `--backend ollama` if local Ollama is running).

**Files:**
- Create: `docs/superpowers/plans/2026-06-10-graphify-spike-notes.md`

- [ ] **Step 1: Install uv + graphifyy locally**

```bash
which uv || curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install graphifyy
graphify --version        # record exact version → becomes GRAPHIFY_VERSION pin
uv --version              # record → becomes minVersion for the toolchain entry
```

- [ ] **Step 2: Verify output location when cwd ≠ input path (the critical question)**

```bash
mkdir -p /tmp/gspike/store && cd /tmp/gspike/store
# small input corpus:
mkdir -p /tmp/gspike/corpus && cp /Users/danielcarter/Documents/Dev/projects/sero/sero/docs/features/host-toolchain.md /tmp/gspike/corpus/
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY graphify extract /tmp/gspike/corpus --backend claude
ls /tmp/gspike/store/graphify-out/ ; ls /tmp/gspike/corpus/graphify-out/ 2>/dev/null
```

Expected: `graph.json` under `/tmp/gspike/store/graphify-out/` (cwd-relative).
**If instead it lands under the input path:** record this in the notes file. Contingency (affects Task 11 only): keep `cwd = workspaceDir` but pass `--out`-style flag if `graphify extract --help` shows one; otherwise build with `cwd = workspace host path` and move `graphify-out/` into the store dir after each build (and add `graphify-out/` to the workspace `.gitignore` like pi-graphify's `ensureGraphifyGitignore`).

- [ ] **Step 3: Verify report generation, query semantics, and merge**

```bash
cd /tmp/gspike/store
graphify cluster-only /tmp/gspike/corpus --no-viz ; ls graphify-out/GRAPH_REPORT.md
graphify query "what is the toolchain" --budget 800      # capture output shape for Task 8 format parity
cp -r /tmp/gspike/store /tmp/gspike/store2
graphify merge-graphs /tmp/gspike/store/graphify-out/graph.json /tmp/gspike/store2/graphify-out/graph.json --out /tmp/gspike/merged.json
python3 -c "import json; g=json.load(open('/tmp/gspike/merged.json')); print(len(g['nodes']), list(g.keys()))"
```

Record in the notes file: graph.json top-level keys, node/link field names (`relation` vs `label` vs `type`), and 2–3 sample `graphify query` outputs (these are the fidelity reference for the TS engine).

- [ ] **Step 4: Record pins + write notes file and commit**

Notes file must contain: GRAPHIFY_VERSION, UV_MIN_VERSION, output-location finding, graph.json field names, sample query outputs.

```bash
git add docs/superpowers/plans/2026-06-10-graphify-spike-notes.md
git commit -m "docs: graphify CLI spike notes for graphify plugin"
```

---

### Task 2: Plugin scaffold

**Files:**
- Create: `plugins/sero-graphify-plugin/package.json`
- Create: `plugins/sero-graphify-plugin/shared/types.ts`
- Create: `plugins/sero-graphify-plugin/shared/paths.ts`, `shared/paths.test.ts`
- Create: `plugins/sero-graphify-plugin/extension/index.ts`, `extension/tsconfig.json`
- Create: `plugins/sero-graphify-plugin/runtime/tsconfig.json` (entry added in Task 13)

Copy `extension/tsconfig.json` and `runtime/tsconfig.json` verbatim from `plugins/sero-admin-plugin/extension/tsconfig.json` (adjust include paths to also cover `../shared`). UI files come in Task 16; the `dev`/`build` scripts are included now so nothing changes later.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@sero-ai/plugin-graphify",
  "version": "0.1.0",
  "description": "Profile-wide knowledge graphs via Graphify — index every workspace, search across all of them",
  "keywords": ["pi-package"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "pnpm exec vitest run --root .",
    "typecheck": "tsc --noEmit -p ui/tsconfig.json && tsc --noEmit -p extension/tsconfig.json && tsc --noEmit -p runtime/tsconfig.json"
  },
  "pi": {
    "extensions": ["./extension/index.ts"]
  },
  "sero": {
    "app": {
      "id": "graphify",
      "name": "Graphify",
      "icon": "waypoints",
      "scope": "global",
      "stateFile": ".sero/apps/graphify/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "GraphifyApp",
      "devPort": 5197,
      "runtime": "./runtime/index.ts"
    },
    "plugin": {
      "category": "developer-tools",
      "tags": ["knowledge-graph", "search", "context", "graphify"],
      "minSeroVersion": "0.1.0",
      "preBuilt": false,
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli", "appRuntime.background"]
    }
  },
  "dependencies": {
    "typebox": "catalog:"
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "catalog:peer",
    "@earendil-works/pi-coding-agent": "catalog:peer",
    "@earendil-works/pi-tui": "catalog:peer",
    "zod": "catalog:peer"
  },
  "devDependencies": {
    "@module-federation/vite": "catalog:",
    "@sero-ai/app-runtime": "workspace:@sero-ai/app-runtime@*",
    "@sero-ai/common": "workspace:*",
    "@sero-ai/ui": "workspace:*",
    "@tailwindcss/vite": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "lucide-react": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

Port 5197 verified free (existing plugins use 5182, 5188, 5193–5196).

- [ ] **Step 2: Write `shared/types.ts`**

```ts
export type GraphifyBackend = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'kimi' | 'ollama';

export interface AutoContextSettings {
  sessionSummary: boolean;
  augmentSearchResults: boolean;
  autoQuery: boolean;
  maxSessionAugments: number;
  maxAugmentChars: number;
}

export interface GraphifySettings {
  backend: GraphifyBackend;
  /** Per-build LLM token cap passed as --token-budget; 0 = graphify default. */
  tokenBudget: number;
  /** Glob patterns passed as repeated --exclude flags. */
  exclude: string[];
  /** 0 disables the background refresh loop. */
  refreshIntervalMinutes: number;
  autoContext: AutoContextSettings;
}

export interface WorkspaceIndexStats {
  nodes: number;
  edges: number;
  communities: number;
  inputTokens: number;
  outputTokens: number;
}

export type WorkspaceIndexStatus = 'idle' | 'queued' | 'building' | 'updating' | 'error';

export interface WorkspaceIndexEntry {
  workspaceId: string;
  name: string;
  path: string;
  enabled: boolean;
  status: WorkspaceIndexStatus;
  lastBuiltAt?: string;
  lastError?: string;
  stats?: WorkspaceIndexStats;
}

export type IndexAction = 'enable' | 'disable' | 'rebuild' | 'refresh' | 'enable-all';

export interface IndexRequest {
  id: number;
  action: IndexAction;
  workspaceId?: string;
  requestedAt: string;
}

export type ProvisioningStatus = 'uninitialized' | 'installing' | 'ready' | 'failed';

export interface ProvisioningState {
  status: ProvisioningStatus;
  uvPath?: string;
  graphifyPath?: string;
  version?: string;
  error?: string;
  updatedAt?: string;
}

export interface ProfileGraphState {
  status: 'absent' | 'merging' | 'ready' | 'failed';
  mergedAt?: string;
  nodes?: number;
  edges?: number;
  workspaceIds?: string[];
  error?: string;
}

export interface GraphifyState {
  settings: GraphifySettings;
  provisioning: ProvisioningState;
  /** Keyed by workspaceId. */
  workspaces: Record<string, WorkspaceIndexEntry>;
  /** Appended by extension/UI, drained by the host runtime. */
  requests: IndexRequest[];
  nextRequestId: number;
  profileGraph: ProfileGraphState;
}

export const DEFAULT_STATE: GraphifyState = {
  settings: {
    backend: 'claude',
    tokenBudget: 0,
    exclude: ['node_modules', 'dist', 'build', 'out', '.git', '*.lock', '*.min.js', '*.map'],
    refreshIntervalMinutes: 10,
    autoContext: {
      sessionSummary: true,
      augmentSearchResults: true,
      autoQuery: false,
      maxSessionAugments: 8,
      maxAugmentChars: 1200,
    },
  },
  provisioning: { status: 'uninitialized' },
  workspaces: {},
  requests: [],
  nextRequestId: 1,
  profileGraph: { status: 'absent' },
};
```

- [ ] **Step 3: Write failing test `shared/paths.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { graphifyPathsFromHome, resolveGraphifyPaths, resolveSeroHome, workspaceGraphDir, workspaceGraphJson, workspaceGraphReport } from './paths';

describe('paths', () => {
  it('resolves SERO_HOME from env in priority order', () => {
    expect(resolveSeroHome({ SERO_HOME: '/profile' })).toBe('/profile');
    expect(resolveSeroHome({ PI_CODING_AGENT_DIR: '/profile/agent' })).toBe('/profile');
    expect(resolveSeroHome({})).toBe(path.join(process.env.HOME ?? '', '.pi'));
  });

  it('derives all graphify paths from home', () => {
    const p = graphifyPathsFromHome('/profile/apps/graphify');
    expect(p.stateFile).toBe('/profile/apps/graphify/state.json');
    expect(p.graphsDir).toBe('/profile/apps/graphify/graphs');
    expect(p.toolsDir).toBe('/profile/apps/graphify/tools');
    expect(p.profileGraph).toBe('/profile/apps/graphify/profile/graph.json');
  });

  it('derives per-workspace artifact paths', () => {
    const p = resolveGraphifyPaths({ SERO_HOME: '/profile' });
    expect(workspaceGraphDir(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws');
    expect(workspaceGraphJson(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws/graphify-out/graph.json');
    expect(workspaceGraphReport(p, 'my-ws')).toBe('/profile/apps/graphify/graphs/my-ws/graphify-out/GRAPH_REPORT.md');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @sero-ai/plugin-graphify test` (after `pnpm install` at repo root so the new package is linked)
Expected: FAIL — `paths` module not found.

- [ ] **Step 5: Write `shared/paths.ts`**

```ts
import os from 'node:os';
import path from 'node:path';

/**
 * Root of the active profile's Sero home. Host path; the same path is
 * mounted into container sessions (read-only is sufficient for queries).
 */
export function resolveSeroHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SERO_HOME) return env.SERO_HOME;
  if (env.PI_CODING_AGENT_DIR) return path.dirname(env.PI_CODING_AGENT_DIR);
  return path.join(os.homedir(), '.pi');
}

export interface GraphifyPaths {
  home: string;
  stateFile: string;
  graphsDir: string;
  toolsDir: string;
  profileDir: string;
  profileGraph: string;
}

export function graphifyPathsFromHome(home: string): GraphifyPaths {
  return {
    home,
    stateFile: path.join(home, 'state.json'),
    graphsDir: path.join(home, 'graphs'),
    toolsDir: path.join(home, 'tools'),
    profileDir: path.join(home, 'profile'),
    profileGraph: path.join(home, 'profile', 'graph.json'),
  };
}

export function resolveGraphifyPaths(env: NodeJS.ProcessEnv = process.env): GraphifyPaths {
  return graphifyPathsFromHome(path.join(resolveSeroHome(env), 'apps', 'graphify'));
}

export function workspaceGraphDir(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(paths.graphsDir, workspaceId);
}

export function workspaceGraphJson(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(workspaceGraphDir(paths, workspaceId), 'graphify-out', 'graph.json');
}

export function workspaceGraphReport(paths: GraphifyPaths, workspaceId: string): string {
  return path.join(workspaceGraphDir(paths, workspaceId), 'graphify-out', 'GRAPH_REPORT.md');
}
```

- [ ] **Step 6: Stub `extension/index.ts`** (real tools in Task 14; stub keeps discovery/typecheck green)

```ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function graphifyExtension(_pi: ExtensionAPI): void {
  // Tools registered in Task 14.
}
```

(If other plugins type the default export differently, mirror `plugins/sero-admin-plugin/extension/index.ts`'s signature exactly.)

- [ ] **Step 7: Run tests + verify discovery**

Run: `pnpm install && pnpm --filter @sero-ai/plugin-graphify test`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add plugins/sero-graphify-plugin docs/superpowers/plans
git commit -m "feat(graphify): scaffold sero-graphify-plugin with state shape and path resolution"
```

---

### Task 3: Core — `host.workspace.list()`

**Files:**
- Modify: `packages/common/src/app-runtime-background.ts` (the `AppRuntimeWorkspaceApi` interface, ~line 120)
- Modify: `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` (the `workspace` block, ~line 83)

- [ ] **Step 1: Add the type to `packages/common/src/app-runtime-background.ts`**

Add above `AppRuntimeWorkspaceApi` and extend the interface:

```ts
export interface AppRuntimeWorkspaceInfo {
  id: string;
  name: string;
  /** Absolute host path to the workspace root. */
  path: string;
  open: boolean;
}
```

```ts
export interface AppRuntimeWorkspaceApi {
  // ... existing members unchanged ...
  /** All workspaces registered in the active profile (host paths). */
  list(): Promise<AppRuntimeWorkspaceInfo[]>;
}
```

- [ ] **Step 2: Implement in `create-host.ts`**

In the `workspace` object after `listAccessRoots`:

```ts
list: async () => {
  const workspaces = await workspaceManager.list();
  return workspaces.map((ws) => ({ id: ws.id, name: ws.name, path: ws.path, open: ws.open }));
},
```

(`workspaceManager.list()` returns `WorkspaceInfo[]` — `apps/desktop/src/types/ipc.ts:52` — which has exactly these fields.)

- [ ] **Step 3: Typecheck both packages**

Run: `pnpm --filter @sero-ai/common typecheck && pnpm --filter @sero/desktop typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/common/src/app-runtime-background.ts apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts
git commit -m "feat(app-runtime): expose workspace.list() to plugin background runtimes"
```

---

### Task 4: Core — provider credentials capability

**Files:**
- Create: `apps/desktop/electron/features/apps/runtime/capabilities/provider-credentials.ts`
- Modify: `packages/common/src/app-runtime-background.ts` (add `AppRuntimeCredentialsApi`, add `credentials` to `AppRuntimeHost`)
- Modify: `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

- [ ] **Step 1: Add types in `packages/common/src/app-runtime-background.ts`**

```ts
export interface AppRuntimeProviderApiKey {
  envVar: string;
  key: string;
}

export interface AppRuntimeCredentialsApi {
  /**
   * Resolve the user's API key for a model provider (e.g. 'anthropic').
   * Returns null when the provider is unknown or no key is configured.
   * The key must only be placed in child-process env — never persisted.
   */
  getProviderApiKey(providerId: string): Promise<AppRuntimeProviderApiKey | null>;
}
```

And in `AppRuntimeHost` add `credentials: AppRuntimeCredentialsApi;` next to the existing members.

- [ ] **Step 2: Implement `provider-credentials.ts`**

Sero stores credentials in `<SERO_HOME>/agent/auth.json` in Pi's auth format (see the comment in `apps/desktop/electron/shared/auth/provider-catalog.ts:10`). Import the existing SERO_HOME resolver from `apps/desktop/electron/platform/env/index.ts` (it exports the resolved profile home used elsewhere in main — check the exact export name in that file and use it; do not re-derive from `os.homedir()`).

```ts
import { readFile } from 'fs/promises';
import path from 'path';
import type { AppRuntimeProviderApiKey } from '@sero-ai/common';
// import the SERO_HOME resolver from '@electron/platform/env' (exact export per that file)

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
};

function extractKey(cred: unknown): string | null {
  if (typeof cred === 'string' && cred) return cred;
  if (cred && typeof cred === 'object') {
    const record = cred as Record<string, unknown>;
    for (const field of ['key', 'apiKey', 'token', 'access']) {
      const value = record[field];
      if (typeof value === 'string' && value) return value;
    }
  }
  return null;
}

export async function getProviderApiKey(
  providerId: string,
  seroHome: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppRuntimeProviderApiKey | null> {
  const envVar = PROVIDER_ENV_VARS[providerId];
  if (!envVar) return null;

  const fromEnv = env[envVar];
  if (fromEnv) return { envVar, key: fromEnv };

  try {
    const raw = await readFile(path.join(seroHome, 'agent', 'auth.json'), 'utf8');
    const auth = JSON.parse(raw) as Record<string, unknown>;
    const key = extractKey(auth?.[providerId]);
    if (key) return { envVar, key };
  } catch {
    // Missing or unreadable auth.json → no key.
  }
  return null;
}
```

- [ ] **Step 3: Write test `provider-credentials.test.ts`** (next to the source; mirror however neighbouring `apps/desktop/electron` tests are laid out — `vitest run` from `apps/desktop` picks up `*.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getProviderApiKey } from './provider-credentials';

describe('getProviderApiKey', () => {
  it('prefers process env', async () => {
    const result = await getProviderApiKey('anthropic', '/nonexistent', { ANTHROPIC_API_KEY: 'sk-env' });
    expect(result).toEqual({ envVar: 'ANTHROPIC_API_KEY', key: 'sk-env' });
  });

  it('falls back to auth.json', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'sero-cred-'));
    await mkdir(path.join(home, 'agent'), { recursive: true });
    await writeFile(path.join(home, 'agent', 'auth.json'), JSON.stringify({ anthropic: { type: 'api_key', key: 'sk-file' } }));
    const result = await getProviderApiKey('anthropic', home, {});
    expect(result).toEqual({ envVar: 'ANTHROPIC_API_KEY', key: 'sk-file' });
  });

  it('returns null for unknown provider or missing key', async () => {
    expect(await getProviderApiKey('unknown', '/nonexistent', {})).toBeNull();
    expect(await getProviderApiKey('anthropic', '/nonexistent', {})).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests** — `pnpm --filter @sero/desktop test -- provider-credentials`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `create-host.ts`**

```ts
import { getProviderApiKey } from './provider-credentials';
// inside createAppRuntimeHost return value:
credentials: {
  getProviderApiKey: (providerId) => getProviderApiKey(providerId, /* resolved SERO_HOME */),
},
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @sero-ai/common typecheck && pnpm --filter @sero/desktop typecheck`

```bash
git add packages/common apps/desktop/electron/features/apps/runtime/capabilities
git commit -m "feat(app-runtime): provider credentials capability for background runtimes"
```

---

### Task 5: Core — add `uv` to the managed toolchain

**Files:**
- Modify: `apps/desktop/electron/features/workspace/runtime/toolchains/types.ts` (ToolName union)
- Modify: `apps/desktop/electron/features/workspace/runtime/toolchains/manifest.ts` (TOOL_NAMES set)
- Modify: `apps/desktop/electron/features/workspace/runtime/toolchains/verifiers.ts` (TOOL_PROBES)
- Modify: `apps/desktop/electron/features/workspace/runtime/toolchains/system-candidates.ts`
- Modify: `apps/desktop/electron/features/workspace/runtime/toolchains/generated-artifacts.json`
- Modify: `docs/features/host-toolchain.md` (tool tiers table: add `uv` to "Small convenience")

- [ ] **Step 1: Add `'uv'` to the `ToolName` union in `types.ts` and to `TOOL_NAMES` in `manifest.ts`.**

- [ ] **Step 2: Add probe in `verifiers.ts` `TOOL_PROBES`** (uses the UV_MIN_VERSION from Task 1 notes):

```ts
uv: { args: ['--version'], minVersion: '<UV_MIN_VERSION from spike notes>', parseVersion: parseFirstVersion },
```

- [ ] **Step 3: Add system candidates.** In `system-candidates.ts`, uv commonly installs to `~/.local/bin` or `~/.cargo/bin`, which are not in `posixSearchRoots`. Add a uv special case in `posixSystemToolCandidates` (mirror how `windowsSystemToolCandidates` special-cases git):

```ts
function posixSystemToolCandidates(tool: ToolName, platform: NodeJS.Platform): string[] {
  const roots = posixSearchRoots(platform);
  const home = process.env.HOME;
  if (tool === 'uv' && home) {
    roots.unshift(path.posix.join(home, '.local', 'bin'), path.posix.join(home, '.cargo', 'bin'));
  }
  return roots.map((root) => path.posix.join(root, tool));
}
```

For Windows, add to `windowsSystemToolCandidates`: `%USERPROFILE%\.local\bin\uv.exe` and `%USERPROFILE%\.cargo\bin\uv.exe` ahead of `pathCandidates`.

- [ ] **Step 4: Pin a uv release and add artifact entries.** Pick the current uv release (same version as spike), then for each target fetch the checksum:

```bash
UV_V=<version from spike>
for t in aarch64-apple-darwin x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu; do
  curl -sL "https://github.com/astral-sh/uv/releases/download/$UV_V/uv-$t.tar.gz.sha256"; done
curl -sL "https://github.com/astral-sh/uv/releases/download/$UV_V/uv-x86_64-pc-windows-msvc.zip.sha256"
```

Add entries to `generated-artifacts.json` following the existing node entry shape (slug, status `"built"`, available `true`). Example for macOS arm64:

```json
"uv-macos-arm64": {
  "tool": "uv",
  "platform": "darwin",
  "arch": "arm64",
  "slug": "uv-macos-arm64",
  "unpackTo": "uv-macos-arm64",
  "binPaths": { "uv": "uv-macos-arm64/uv-aarch64-apple-darwin/uv" },
  "minVersion": "<UV_MIN_VERSION>",
  "installPolicy": "on-demand",
  "status": "built",
  "available": true,
  "url": "https://github.com/astral-sh/uv/releases/download/<UV_V>/uv-aarch64-apple-darwin.tar.gz",
  "sha256": "<from .sha256 file>"
}
```

Repeat for `uv-linux-x64` (`x86_64-unknown-linux-gnu`), `uv-linux-arm64` (`aarch64-unknown-linux-gnu`), `uv-windows-x64` (`x86_64-pc-windows-msvc`, `.zip`, binPath `uv-windows-x64/uv.exe` — the Windows zip has no inner directory).

**Verify the binPaths against unpack behavior:** read `archives.ts` `unpackArchive` — if it strips the archive's top-level directory into `unpackTo`, the binPath is `uv-macos-arm64/uv` instead. Adjust to match; this must agree with how `node-macos-arm64` (binPath `node-macos-arm64/bin/node` for an archive whose top dir is `node-v22...`) is handled.

Note: these URLs point at astral's GitHub Release assets, not `sero-labs/sero` releases. `toolchain:verify-published` gates **core** artifacts only; uv is `on-demand`. If the release gate still complains, mirror the four archives into the next `toolchains-*` release and update the URLs — the spec only requires pinned sha256 GitHub Release assets.

- [ ] **Step 5: Typecheck + run toolchain tests + verify gate**

Run: `pnpm --filter @sero/desktop typecheck && pnpm --filter @sero/desktop test -- toolchains`
Expected: PASS (manifest validation accepts the new entries).
Run: `pnpm --filter @sero/desktop toolchain:verify-published`
Expected: still PASS (uv is not core). If it fails on uv, see the mirroring note above.

- [ ] **Step 6: Update `docs/features/host-toolchain.md`** — add `uv` to the "Small convenience" tier row and a one-line note that uv installs from astral's pinned release assets.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/features/workspace/runtime/toolchains docs/features/host-toolchain.md
git commit -m "feat(toolchain): add uv as an on-demand managed tool"
```

---

### Task 6: Core — `host.toolchains.ensure()` capability

**Files:**
- Modify: `packages/common/src/app-runtime-background.ts`
- Modify: `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

- [ ] **Step 1: Add types in common**

```ts
export interface AppRuntimeToolchainsApi {
  /** Resolve a Sero-managed tool, installing it on demand. Returns the executable path. */
  ensure(tool: string): Promise<{ path: string }>;
}
```

Add `toolchains: AppRuntimeToolchainsApi;` to `AppRuntimeHost`.

- [ ] **Step 2: Implement in `create-host.ts`**

```ts
import { ToolchainManager } from '@electron/features/workspace/runtime/toolchains/manager';
import { loadBundledToolchainManifest } from '@electron/features/workspace/runtime/toolchains/manifest';
import { isToolName } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
// inside createAppRuntimeHost return value:
toolchains: {
  ensure: async (tool) => {
    if (!isToolName(tool)) throw new Error(`Unknown managed tool: ${tool}`);
    const manager = new ToolchainManager({ manifest: loadBundledToolchainManifest() });
    const resolution = await manager.ensure(tool, { kind: 'plugin-install' });
    return { path: resolution.path };
  },
},
```

(`'plugin-install'` is an existing `ToolInstallReasonKind` — `toolchains/types.ts`. If `ToolInstallReason` requires additional fields beyond `kind`, fill them per its interface definition in that file.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @sero-ai/common typecheck && pnpm --filter @sero/desktop typecheck`

```bash
git add packages/common apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts
git commit -m "feat(app-runtime): toolchains.ensure capability for background runtimes"
```

---

### Task 7: Query engine — graph loader

**Files:**
- Create: `plugins/sero-graphify-plugin/shared/query-engine/graph-loader.ts`
- Test: `plugins/sero-graphify-plugin/shared/query-engine/graph-loader.test.ts`
- Create: `plugins/sero-graphify-plugin/shared/query-engine/fixtures/small-graph.json`

graph.json is networkx node-link format. Use the exact field names recorded in the Task 1 spike notes; the loader below tolerates the common variants.

- [ ] **Step 1: Write fixture `fixtures/small-graph.json`** (hand-crafted; field names matched to spike notes):

```json
{
  "directed": true,
  "nodes": [
    { "id": "AuthService", "type": "class", "community": 0, "description": "Handles user authentication and sessions" },
    { "id": "TokenStore", "type": "class", "community": 0, "description": "Persists refresh tokens" },
    { "id": "LoginHandler", "type": "function", "community": 0, "description": "HTTP login endpoint" },
    { "id": "BillingService", "type": "class", "community": 1, "description": "Subscription billing" },
    { "id": "InvoiceJob", "type": "function", "community": 1, "description": "Nightly invoice generation" },
    { "id": "Orphan", "type": "concept", "community": 2, "description": "Disconnected node" }
  ],
  "links": [
    { "source": "LoginHandler", "target": "AuthService", "relation": "CALLS" },
    { "source": "AuthService", "target": "TokenStore", "relation": "USES" },
    { "source": "BillingService", "target": "AuthService", "relation": "DEPENDS_ON" },
    { "source": "InvoiceJob", "target": "BillingService", "relation": "CALLS" }
  ]
}
```

- [ ] **Step 2: Write failing test `graph-loader.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadGraph } from './graph-loader';

const FIXTURE = path.join(__dirname, 'fixtures', 'small-graph.json');

describe('loadGraph', () => {
  it('indexes nodes and edges in both directions', async () => {
    const graph = await loadGraph(FIXTURE);
    expect(graph).not.toBeNull();
    expect(graph!.nodes.size).toBe(6);
    expect(graph!.edgeCount).toBe(4);
    expect(graph!.out.get('AuthService')).toHaveLength(1);
    expect(graph!.in.get('AuthService')).toHaveLength(2);
    expect(graph!.out.get('AuthService')![0]).toMatchObject({ source: 'AuthService', target: 'TokenStore', relation: 'USES' });
  });

  it('returns null for missing, oversized, or malformed files', async () => {
    expect(await loadGraph('/nonexistent/graph.json')).toBeNull();
    expect(await loadGraph(FIXTURE, 10)).toBeNull(); // 10-byte cap
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — `pnpm --filter @sero-ai/plugin-graphify test -- graph-loader`

- [ ] **Step 4: Implement `graph-loader.ts`**

```ts
import { readFile, stat } from 'node:fs/promises';

export interface GraphNode {
  id: string;
  type?: string;
  community?: number;
  description?: string;
  label?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  out: Map<string, GraphEdge[]>;
  in: Map<string, GraphEdge[]>;
  edgeCount: number;
}

export const MAX_GRAPH_BYTES = 64 * 1024 * 1024;

function endpointId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

/** Load a graphify graph.json (networkx node-link). Returns null on any problem — callers treat that as "no graph". */
export async function loadGraph(filePath: string, maxBytes = MAX_GRAPH_BYTES): Promise<KnowledgeGraph | null> {
  let raw: string;
  try {
    const info = await stat(filePath);
    if (info.size > maxBytes) return null;
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let data: { nodes?: unknown; links?: unknown; edges?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const rawLinks = Array.isArray(data?.links) ? data.links : Array.isArray(data?.edges) ? data.edges : null;
  if (!Array.isArray(data?.nodes) || !rawLinks) return null;

  const graph: KnowledgeGraph = { nodes: new Map(), out: new Map(), in: new Map(), edgeCount: 0 };

  for (const node of data.nodes as Array<Record<string, unknown>>) {
    const id = endpointId(node?.id);
    if (!id) continue;
    graph.nodes.set(id, { ...node, id } as GraphNode);
  }

  for (const link of rawLinks as Array<Record<string, unknown>>) {
    const source = endpointId(link?.source);
    const target = endpointId(link?.target);
    if (!source || !target || !graph.nodes.has(source) || !graph.nodes.has(target)) continue;
    const relation = String(link.relation ?? link.label ?? link.type ?? 'RELATED');
    const edge: GraphEdge = { source, target, relation };
    if (!graph.out.has(source)) graph.out.set(source, []);
    if (!graph.in.has(target)) graph.in.set(target, []);
    graph.out.get(source)!.push(edge);
    graph.in.get(target)!.push(edge);
    graph.edgeCount += 1;
  }

  return graph;
}
```

- [ ] **Step 5: Run to verify PASS**, then commit:

```bash
git add plugins/sero-graphify-plugin/shared/query-engine
git commit -m "feat(graphify): graph.json loader with size caps and tolerant parsing"
```

---

### Task 8: Query engine — traversal, formatting, public API

**Files:**
- Create: `shared/query-engine/traverse.ts` + `traverse.test.ts`
- Create: `shared/query-engine/format.ts`
- Create: `shared/query-engine/index.ts` + `index.test.ts`
(all under `plugins/sero-graphify-plugin/`)

Behavioral reference: the sample `graphify query` outputs captured in the spike notes. Match the *shape* (seed nodes → related nodes with relations → community grouping), not byte-for-byte text.

- [ ] **Step 1: Write failing tests `traverse.test.ts`**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { loadGraph, type KnowledgeGraph } from './graph-loader';
import { findSeeds, bfsNeighborhood, shortestPath, neighborhoodOf } from './traverse';

let graph: KnowledgeGraph;
beforeAll(async () => {
  graph = (await loadGraph(path.join(__dirname, 'fixtures', 'small-graph.json')))!;
});

describe('findSeeds', () => {
  it('ranks exact id matches first', () => {
    const seeds = findSeeds(graph, 'how does AuthService work');
    expect(seeds[0].id).toBe('AuthService');
  });
  it('matches on descriptions', () => {
    const seeds = findSeeds(graph, 'subscription billing invoices');
    expect(seeds.map((s) => s.id)).toContain('BillingService');
  });
  it('returns empty for no matches', () => {
    expect(findSeeds(graph, 'zzz qqq')).toEqual([]);
  });
});

describe('bfsNeighborhood', () => {
  it('collects nodes by depth with the connecting edge', () => {
    const hits = bfsNeighborhood(graph, [graph.nodes.get('LoginHandler')!], 2, 10);
    const ids = hits.map((h) => h.node.id);
    expect(ids).toContain('AuthService'); // depth 1
    expect(ids).toContain('TokenStore'); // depth 2
    expect(ids).not.toContain('Orphan');
  });
  it('respects maxNodes', () => {
    expect(bfsNeighborhood(graph, [graph.nodes.get('LoginHandler')!], 3, 2)).toHaveLength(2);
  });
});

describe('shortestPath', () => {
  it('finds a path across directions', () => {
    const edges = shortestPath(graph, 'InvoiceJob', 'TokenStore');
    expect(edges).not.toBeNull();
    expect(edges!.length).toBe(3); // InvoiceJob→BillingService→AuthService→TokenStore
  });
  it('returns null when disconnected', () => {
    expect(shortestPath(graph, 'Orphan', 'AuthService')).toBeNull();
  });
});

describe('neighborhoodOf', () => {
  it('groups incoming/outgoing edges and community peers', () => {
    const hood = neighborhoodOf(graph, 'AuthService')!;
    expect(hood.outgoing).toHaveLength(1);
    expect(hood.incoming).toHaveLength(2);
    expect(hood.communityPeers).toContain('TokenStore');
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `traverse.ts`**

```ts
import type { GraphEdge, GraphNode, KnowledgeGraph } from './graph-loader';

export interface NeighborhoodHit {
  node: GraphNode;
  depth: number;
  /** Edge that first reached this node (undefined for seeds). */
  via?: GraphEdge;
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'how', 'what', 'does', 'with', 'this', 'that', 'where', 'why', 'who', 'are', 'can']);

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export function findSeeds(graph: KnowledgeGraph, query: string, limit = 5): GraphNode[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scored: Array<{ node: GraphNode; score: number }> = [];
  for (const node of graph.nodes.values()) {
    const idLower = node.id.toLowerCase();
    const haystack = `${idLower} ${String(node.label ?? '').toLowerCase()} ${String(node.description ?? '').toLowerCase()}`;
    let score = 0;
    for (const term of terms) {
      if (idLower === term) score += 10;
      else if (idLower.includes(term)) score += 5;
      else if (haystack.includes(term)) score += term.length >= 5 ? 3 : 1;
    }
    if (score > 0) scored.push({ node, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.node);
}

function undirectedEdges(graph: KnowledgeGraph, id: string): GraphEdge[] {
  return [...(graph.out.get(id) ?? []), ...(graph.in.get(id) ?? [])];
}

function otherEnd(edge: GraphEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

export function bfsNeighborhood(
  graph: KnowledgeGraph,
  seeds: GraphNode[],
  maxDepth = 2,
  maxNodes = 60,
): NeighborhoodHit[] {
  const visited = new Set(seeds.map((s) => s.id));
  const hits: NeighborhoodHit[] = [];
  let frontier: Array<{ id: string; depth: number }> = seeds.map((s) => ({ id: s.id, depth: 0 }));

  while (frontier.length > 0 && hits.length < maxNodes) {
    const next: typeof frontier = [];
    for (const { id, depth } of frontier) {
      if (depth >= maxDepth) continue;
      for (const edge of undirectedEdges(graph, id)) {
        const neighborId = otherEnd(edge, id);
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const node = graph.nodes.get(neighborId);
        if (!node) continue;
        hits.push({ node, depth: depth + 1, via: edge });
        if (hits.length >= maxNodes) return hits;
        next.push({ id: neighborId, depth: depth + 1 });
      }
    }
    frontier = next;
  }
  return hits;
}

export function shortestPath(graph: KnowledgeGraph, fromId: string, toId: string): GraphEdge[] | null {
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;
  if (fromId === toId) return [];
  const previous = new Map<string, { id: string; edge: GraphEdge }>();
  const visited = new Set([fromId]);
  let frontier = [fromId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of undirectedEdges(graph, id)) {
        const neighborId = otherEnd(edge, id);
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        previous.set(neighborId, { id, edge });
        if (neighborId === toId) {
          const pathEdges: GraphEdge[] = [];
          let cursor = toId;
          while (cursor !== fromId) {
            const step = previous.get(cursor)!;
            pathEdges.unshift(step.edge);
            cursor = step.id;
          }
          return pathEdges;
        }
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return null;
}

export interface Neighborhood {
  node: GraphNode;
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
  communityPeers: string[];
}

export function neighborhoodOf(graph: KnowledgeGraph, id: string, maxPeers = 10): Neighborhood | null {
  const node = graph.nodes.get(id);
  if (!node) return null;
  const communityPeers: string[] = [];
  if (node.community !== undefined) {
    for (const other of graph.nodes.values()) {
      if (other.id !== id && other.community === node.community) {
        communityPeers.push(other.id);
        if (communityPeers.length >= maxPeers) break;
      }
    }
  }
  return {
    node,
    outgoing: graph.out.get(id) ?? [],
    incoming: graph.in.get(id) ?? [],
    communityPeers,
  };
}

/** Resolve a user-supplied concept name to a node id (exact, case-insensitive, then seed search). */
export function resolveConcept(graph: KnowledgeGraph, concept: string): GraphNode | null {
  if (graph.nodes.has(concept)) return graph.nodes.get(concept)!;
  const lower = concept.toLowerCase();
  for (const node of graph.nodes.values()) {
    if (node.id.toLowerCase() === lower) return node;
  }
  return findSeeds(graph, concept, 1)[0] ?? null;
}
```

- [ ] **Step 4: Run traverse tests → PASS.**

- [ ] **Step 5: Implement `format.ts` and `index.ts`, with `index.test.ts`**

`format.ts`:

```ts
const CHARS_PER_TOKEN = 4;

/** Truncate rendered lines to a token budget (approx 4 chars/token). */
export function withinBudget(lines: string[], budgetTokens: number): string {
  const maxChars = Math.max(budgetTokens, 100) * CHARS_PER_TOKEN;
  const output: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars) {
      output.push('… (truncated to budget)');
      break;
    }
    output.push(line);
    used += line.length + 1;
  }
  return output.join('\n');
}

export function nodeLine(node: { id: string; type?: string; description?: string }): string {
  const type = node.type ? ` (${node.type})` : '';
  const description = node.description ? ` — ${node.description}` : '';
  return `${node.id}${type}${description}`;
}

export function edgeLine(edge: { source: string; relation: string; target: string }): string {
  return `${edge.source} —[${edge.relation}]→ ${edge.target}`;
}
```

`index.ts`:

```ts
import type { KnowledgeGraph } from './graph-loader';
import { bfsNeighborhood, findSeeds, neighborhoodOf, resolveConcept, shortestPath } from './traverse';
import { edgeLine, nodeLine, withinBudget } from './format';

export { loadGraph, MAX_GRAPH_BYTES } from './graph-loader';
export type { KnowledgeGraph, GraphNode, GraphEdge } from './graph-loader';

export interface QueryOptions {
  mode?: 'bfs' | 'dfs';
  budget?: number;
}

/**
 * Answer a question with a relevant subgraph rendered as text.
 * bfs = broad context (depth 2 wide), dfs = trace (depth 4 narrow).
 */
export function queryGraph(graph: KnowledgeGraph, question: string, options: QueryOptions = {}): string {
  const { mode = 'bfs', budget = 1200 } = options;
  const seeds = findSeeds(graph, question);
  if (seeds.length === 0) return 'No matching concepts found in the graph.';

  const hits = mode === 'dfs'
    ? bfsNeighborhood(graph, seeds.slice(0, 1), 4, 25)
    : bfsNeighborhood(graph, seeds, 2, 60);

  const lines: string[] = [`Concepts matching "${question}":`];
  for (const seed of seeds) lines.push(`• ${nodeLine(seed)}`);
  lines.push('', 'Related:');
  for (const hit of hits) {
    lines.push(`  ${'  '.repeat(hit.depth - 1)}↳ ${nodeLine(hit.node)}${hit.via ? `  [via ${edgeLine(hit.via)}]` : ''}`);
  }
  return withinBudget(lines, budget);
}

export function findPath(graph: KnowledgeGraph, from: string, to: string, budget = 800): string {
  const fromNode = resolveConcept(graph, from);
  const toNode = resolveConcept(graph, to);
  if (!fromNode || !toNode) return `Could not resolve ${!fromNode ? `"${from}"` : `"${to}"`} to a graph node.`;
  const edges = shortestPath(graph, fromNode.id, toNode.id);
  if (edges === null) return `No path found between ${fromNode.id} and ${toNode.id}.`;
  if (edges.length === 0) return `${fromNode.id} and ${toNode.id} are the same node.`;
  return withinBudget([`Path (${edges.length} hops):`, ...edges.map((e) => `  ${edgeLine(e)}`)], budget);
}

export function explainNode(graph: KnowledgeGraph, concept: string, budget = 1000): string {
  const node = resolveConcept(graph, concept);
  if (!node) return `"${concept}" not found in the graph.`;
  const hood = neighborhoodOf(graph, node.id)!;
  const lines = [nodeLine(node), ''];
  if (hood.outgoing.length > 0) lines.push('Outgoing:', ...hood.outgoing.map((e) => `  ${edgeLine(e)}`));
  if (hood.incoming.length > 0) lines.push('Incoming:', ...hood.incoming.map((e) => `  ${edgeLine(e)}`));
  if (hood.communityPeers.length > 0) lines.push(`Same community: ${hood.communityPeers.join(', ')}`);
  return withinBudget(lines, budget);
}
```

`index.test.ts`:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { loadGraph, queryGraph, findPath, explainNode, type KnowledgeGraph } from './index';

let graph: KnowledgeGraph;
beforeAll(async () => {
  graph = (await loadGraph(path.join(__dirname, 'fixtures', 'small-graph.json')))!;
});

describe('queryGraph', () => {
  it('returns seeds and related nodes', () => {
    const answer = queryGraph(graph, 'authentication sessions');
    expect(answer).toContain('AuthService');
    expect(answer).toContain('TokenStore');
  });
  it('truncates to budget', () => {
    const answer = queryGraph(graph, 'authentication sessions', { budget: 30 });
    expect(answer).toContain('truncated');
    expect(answer.length).toBeLessThan(600);
  });
  it('handles no matches', () => {
    expect(queryGraph(graph, 'zzzz')).toContain('No matching concepts');
  });
});

describe('findPath', () => {
  it('renders hop chain', () => {
    expect(findPath(graph, 'InvoiceJob', 'TokenStore')).toContain('3 hops');
  });
});

describe('explainNode', () => {
  it('renders neighborhood', () => {
    const answer = explainNode(graph, 'authservice');
    expect(answer).toContain('Outgoing:');
    expect(answer).toContain('Incoming:');
  });
});
```

- [ ] **Step 6: Run all engine tests → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/shared/query-engine
git commit -m "feat(graphify): TypeScript graph query engine (query/path/explain)"
```

- [ ] **Step 7: Fidelity check against spike notes.** Compare `queryGraph` output shape with the captured `graphify query` samples; adjust formatting (section headings, edge arrow style) if meaningfully divergent. Commit any tweaks.

---

### Task 9: Runtime — bounded exec

**Files:**
- Create: `plugins/sero-graphify-plugin/runtime/bounded-exec.ts`
- Test: `plugins/sero-graphify-plugin/runtime/bounded-exec.test.ts`

This replaces pi-graphify's `exec-adapter` (which wrapped `pi.exec`) — the runtime has no `pi`, so we wrap `child_process.spawn` with the same discipline: output caps, timeout kill, signal-death = failure. Reference: `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-graphify/src/tools/exec-adapter.ts`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { boundedExec, OUTPUT_LIMIT_EXIT_CODE, TIMEOUT_EXIT_CODE } from './bounded-exec';

describe('boundedExec', () => {
  it('captures stdout/stderr and exit code', async () => {
    const result = await boundedExec('sh', ['-c', 'echo out; echo err >&2; exit 3']);
    expect(result.stdout.trim()).toBe('out');
    expect(result.stderr.trim()).toBe('err');
    expect(result.exitCode).toBe(3);
  });

  it('kills and reports when output exceeds the cap', async () => {
    const result = await boundedExec('sh', ['-c', 'yes x | head -c 100000'], { maxOutputBytes: 1024 });
    expect(result.exitCode).toBe(OUTPUT_LIMIT_EXIT_CODE);
  });

  it('kills and reports on timeout', async () => {
    const result = await boundedExec('sleep', ['5'], { timeoutMs: 200 });
    expect(result.exitCode).toBe(TIMEOUT_EXIT_CODE);
  });

  it('reports missing binaries as failures, not throws', async () => {
    const result = await boundedExec('/nonexistent/binary', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('ENOENT');
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MiB
export const JSON_MAX_OUTPUT_BYTES = 2_097_152; // 2 MiB
export const OUTPUT_LIMIT_EXIT_CODE = 125;
export const TIMEOUT_EXIT_CODE = 124;

/** Spawn with hard output/time bounds. Never throws; failures land in exitCode/stderr. */
export function boundedExec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const { cwd, env, timeoutMs = 10 * 60_000, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let finished = false;
    let limitHit = false;
    let timedOut = false;

    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        if (!limitHit) {
          limitHit = true;
          child.kill('SIGKILL');
        }
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    const finish = (exitCode: number, extraStderr?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (extraStderr) stderr += (stderr ? '\n' : '') + extraStderr;
      resolve({ stdout, stderr, exitCode });
    };

    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', (error) => finish(127, String(error)));
    child.on('close', (code, signal) => {
      if (limitHit) return finish(OUTPUT_LIMIT_EXIT_CODE, `Output exceeded ${maxOutputBytes} bytes; process killed.`);
      if (timedOut) return finish(TIMEOUT_EXIT_CODE, `Timed out after ${timeoutMs}ms; process killed.`);
      if (signal) return finish(1, `Process killed by signal ${signal}.`);
      finish(code ?? 1);
    });
  });
}

export type ExecFn = typeof boundedExec;
```

- [ ] **Step 4: Run → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/runtime
git commit -m "feat(graphify): bounded exec for host-side graphify invocations"
```

---

### Task 10: Runtime — provisioner

**Files:**
- Create: `plugins/sero-graphify-plugin/runtime/provisioner.ts`
- Test: `plugins/sero-graphify-plugin/runtime/provisioner.test.ts`

- [ ] **Step 1: Write failing tests** (fake `ExecFn`, fake `ensureUv`)

```ts
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { provisionGraphify, GRAPHIFY_VERSION, graphifyBinPath, uvEnv } from './provisioner';
import type { ExecResult } from './bounded-exec';

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 });
const fail = (stderr: string): ExecResult => ({ stdout: '', stderr, exitCode: 1 });

describe('provisionGraphify', () => {
  it('skips install when the pinned version is already present', async () => {
    const exec = vi.fn().mockResolvedValue(ok(`graphify ${GRAPHIFY_VERSION}`));
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' });
    expect(result.graphifyPath).toBe(graphifyBinPath('/tools'));
    expect(exec).toHaveBeenCalledTimes(1); // version probe only
  });

  it('installs via uv tool install when missing, with isolated uv env', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(fail('not found'))                 // probe
      .mockResolvedValueOnce(ok('Installed graphifyy'))          // install
      .mockResolvedValueOnce(ok(`graphify ${GRAPHIFY_VERSION}`)); // verify
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' });
    expect(result.version).toBe(GRAPHIFY_VERSION);
    const installCall = exec.mock.calls[1];
    expect(installCall[0]).toBe('/uv');
    expect(installCall[1]).toEqual(['tool', 'install', '--force', `graphifyy==${GRAPHIFY_VERSION}`]);
    expect(installCall[2].env.UV_TOOL_BIN_DIR).toBe(path.join('/tools', 'bin'));
  });

  it('throws a useful error when install fails', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(fail('not found'))
      .mockResolvedValueOnce(fail('network unreachable'));
    await expect(provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' }))
      .rejects.toThrow(/network unreachable/);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `provisioner.ts`**

```ts
import path from 'node:path';
import type { ExecFn } from './bounded-exec';
import { JSON_MAX_OUTPUT_BYTES } from './bounded-exec';

/** Pinned graphifyy version — from the Task 1 spike notes. Upgrades are deliberate version bumps here. */
export const GRAPHIFY_VERSION = '<GRAPHIFY_VERSION from spike notes>';

export interface ProvisionDeps {
  /** Resolve the uv executable (host.toolchains.ensure('uv')). */
  ensureUv(): Promise<string>;
  exec: ExecFn;
  /** <graphify home>/tools — everything uv-related is isolated here. */
  toolsDir: string;
}

export interface ProvisionResult {
  uvPath: string;
  graphifyPath: string;
  version: string;
}

export function graphifyBinPath(toolsDir: string): string {
  const binName = process.platform === 'win32' ? 'graphify.exe' : 'graphify';
  return path.join(toolsDir, 'bin', binName);
}

export function uvEnv(toolsDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_TOOL_DIR: path.join(toolsDir, 'uv-tools'),
    UV_TOOL_BIN_DIR: path.join(toolsDir, 'bin'),
    UV_PYTHON_INSTALL_DIR: path.join(toolsDir, 'python'),
  };
}

/** Idempotent: probes the pinned version first, installs only when absent or different. */
export async function provisionGraphify(deps: ProvisionDeps): Promise<ProvisionResult> {
  const graphifyPath = graphifyBinPath(deps.toolsDir);
  const env = uvEnv(deps.toolsDir);

  const probe = await deps.exec(graphifyPath, ['--version'], { env, timeoutMs: 30_000 });
  if (probe.exitCode === 0 && probe.stdout.includes(GRAPHIFY_VERSION)) {
    return { uvPath: '', graphifyPath, version: GRAPHIFY_VERSION };
  }

  const uvPath = await deps.ensureUv();
  const install = await deps.exec(
    uvPath,
    ['tool', 'install', '--force', `graphifyy==${GRAPHIFY_VERSION}`],
    { env, timeoutMs: 15 * 60_000, maxOutputBytes: JSON_MAX_OUTPUT_BYTES },
  );
  if (install.exitCode !== 0) {
    throw new Error(`graphifyy install failed (exit ${install.exitCode}): ${install.stderr || install.stdout}`.slice(0, 2000));
  }

  const verify = await deps.exec(graphifyPath, ['--version'], { env, timeoutMs: 30_000 });
  if (verify.exitCode !== 0) {
    throw new Error(`graphify not runnable after install: ${verify.stderr || verify.stdout}`.slice(0, 2000));
  }
  return { uvPath, graphifyPath, version: GRAPHIFY_VERSION };
}
```

Replace `<GRAPHIFY_VERSION from spike notes>` with the actual pinned version string before committing.

- [ ] **Step 4: Run → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/runtime
git commit -m "feat(graphify): graphifyy provisioner via managed uv"
```

---

### Task 11: Runtime — graphify runner + credentials env

**Files:**
- Create: `plugins/sero-graphify-plugin/runtime/graphify-runner.ts` + `graphify-runner.test.ts`
- Create: `plugins/sero-graphify-plugin/runtime/credentials.ts` + `credentials.test.ts`

Stat-parsing regexes are lifted from pi-graphify (`src/lib/runner.ts` `runExtract`). **Apply the Task 1 contingency here** if the spike found output landing in the input path instead of cwd.

- [ ] **Step 1: Write failing tests `credentials.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { BACKEND_PROVIDERS, extractionEnv } from './credentials';

describe('extractionEnv', () => {
  it('injects the matching provider key', async () => {
    const env = await extractionEnv('claude', async (id) =>
      id === 'anthropic' ? { envVar: 'ANTHROPIC_API_KEY', key: 'sk-test' } : null, {});
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('throws a clear error when the key is missing', async () => {
    await expect(extractionEnv('openai', async () => null, {})).rejects.toThrow(/OpenAI/i);
  });

  it('requires no key for ollama', async () => {
    const env = await extractionEnv('ollama', async () => null, {});
    expect(env).toBeDefined();
  });

  it('maps every backend', () => {
    expect(Object.keys(BACKEND_PROVIDERS).sort()).toEqual(['claude', 'deepseek', 'gemini', 'kimi', 'ollama', 'openai']);
  });
});
```

- [ ] **Step 2: Implement `credentials.ts`**

```ts
import type { GraphifyBackend } from '../shared/types';

export interface ProviderKey {
  envVar: string;
  key: string;
}

export type GetProviderApiKey = (providerId: string) => Promise<ProviderKey | null>;

export const BACKEND_PROVIDERS: Record<GraphifyBackend, { providerId: string | null; displayName: string }> = {
  claude: { providerId: 'anthropic', displayName: 'Anthropic' },
  openai: { providerId: 'openai', displayName: 'OpenAI' },
  gemini: { providerId: 'google', displayName: 'Google (Gemini)' },
  deepseek: { providerId: 'deepseek', displayName: 'DeepSeek' },
  kimi: { providerId: 'moonshotai', displayName: 'Moonshot (Kimi)' },
  ollama: { providerId: null, displayName: 'Ollama (local)' },
};

/** Build the child-process env for graphify extraction. Throws when the backend needs a key the user hasn't configured. */
export async function extractionEnv(
  backend: GraphifyBackend,
  getProviderApiKey: GetProviderApiKey,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const mapping = BACKEND_PROVIDERS[backend];
  const env = { ...baseEnv };
  if (mapping.providerId) {
    const provider = await getProviderApiKey(mapping.providerId);
    if (!provider) {
      throw new Error(`No API key configured for ${mapping.displayName}. Add one in Sero settings or choose another backend.`);
    }
    env[provider.envVar] = provider.key;
  }
  return env;
}
```

- [ ] **Step 3: Write failing tests `graphify-runner.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildWorkspaceGraph, updateWorkspaceGraph, mergeProfileGraph, parseBuildStats } from './graphify-runner';
import type { ExecResult } from './bounded-exec';

const EXTRACT_STDOUT = [
  '[graphify extract] wrote graphify-out/graph.json: 1,234 nodes, 5,678 edges, 12 communities',
  '[graphify extract] tokens: 45,000 in / 9,000 out, est. cost (~claude): $0.5100',
  'processed 87 files',
].join('\n');

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 });

describe('parseBuildStats', () => {
  it('parses comma-formatted stats and tokens', () => {
    expect(parseBuildStats(EXTRACT_STDOUT)).toEqual({
      nodes: 1234, edges: 5678, communities: 12, inputTokens: 45000, outputTokens: 9000,
    });
  });
  it('defaults to zeros on unparseable output', () => {
    expect(parseBuildStats('done')).toEqual({ nodes: 0, edges: 0, communities: 0, inputTokens: 0, outputTokens: 0 });
  });
});

describe('buildWorkspaceGraph', () => {
  it('runs extract with backend/budget/excludes in the workspace store dir', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    const stats = await buildWorkspaceGraph(
      { exec, graphifyPath: '/tools/bin/graphify', env: {} },
      { workspaceDir: '/store/ws1', inputPath: '/home/me/proj', backend: 'claude', tokenBudget: 4096, exclude: ['node_modules'] },
    );
    expect(stats.nodes).toBe(1234);
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe('/tools/bin/graphify');
    expect(args).toEqual(['extract', '/home/me/proj', '--backend', 'claude', '--token-budget', '4096', '--exclude', 'node_modules']);
    expect(opts.cwd).toBe('/store/ws1');
  });

  it('throws with stderr tail on failure', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1 });
    await expect(buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      { workspaceDir: '/s', inputPath: '/p', backend: 'claude', tokenBudget: 0, exclude: [] },
    )).rejects.toThrow(/boom/);
  });
});

describe('mergeProfileGraph', () => {
  it('passes all graph paths and --out', async () => {
    const exec = vi.fn().mockResolvedValue(ok('merged'));
    await mergeProfileGraph({ exec, graphifyPath: 'g', env: {} }, ['/a/graph.json', '/b/graph.json'], '/profile/graph.json');
    expect(exec.mock.calls[0][1]).toEqual(['merge-graphs', '/a/graph.json', '/b/graph.json', '--out', '/profile/graph.json']);
  });
});
```

- [ ] **Step 4: Implement `graphify-runner.ts`**

```ts
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ExecFn } from './bounded-exec';
import type { GraphifyBackend, WorkspaceIndexStats } from '../shared/types';

export interface RunnerDeps {
  exec: ExecFn;
  graphifyPath: string;
  env: NodeJS.ProcessEnv;
}

export interface BuildOptions {
  /** cwd for graphify — the sero-managed per-workspace store dir (graphify-out lands here). */
  workspaceDir: string;
  /** Workspace root host path (graphify input). */
  inputPath: string;
  backend: GraphifyBackend;
  tokenBudget: number;
  exclude: string[];
}

const BUILD_TIMEOUT_MS = 60 * 60_000;

function tail(text: string, max = 2000): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/** Parse stats from graphify extract/update stdout (regexes from pi-graphify src/lib/runner.ts). */
export function parseBuildStats(stdout: string): WorkspaceIndexStats {
  const summary = stdout.match(/(\d[\d,]*)\s+nodes?,\s*(\d[\d,]*)\s+edges?,\s*(\d[\d,]*)\s+communities/i);
  const parse = (value: string | undefined) => (value ? Number.parseInt(value.replace(/,/g, ''), 10) : 0);
  const tokens = stdout.match(/(\d[\d,]*)\s+in\s*\/\s*(\d[\d,]*)\s+out/i);
  return {
    nodes: parse(summary?.[1] ?? stdout.match(/(\d[\d,]*)\s+nodes?/i)?.[1]),
    edges: parse(summary?.[2] ?? stdout.match(/(\d[\d,]*)\s+edges?/i)?.[1]),
    communities: parse(summary?.[3]),
    inputTokens: parse(tokens?.[1]),
    outputTokens: parse(tokens?.[2]),
  };
}

function buildArgs(options: BuildOptions): string[] {
  const args = ['extract', options.inputPath, '--backend', options.backend];
  if (options.tokenBudget > 0) args.push('--token-budget', String(options.tokenBudget));
  for (const pattern of options.exclude) args.push('--exclude', pattern);
  return args;
}

export async function buildWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  await mkdir(options.workspaceDir, { recursive: true });
  const result = await deps.exec(deps.graphifyPath, buildArgs(options), {
    cwd: options.workspaceDir,
    env: deps.env,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify extract failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  // Report generation (GRAPH_REPORT.md) — non-fatal if it fails.
  await deps.exec(deps.graphifyPath, ['cluster-only', options.inputPath, '--no-viz'], {
    cwd: options.workspaceDir,
    env: deps.env,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  return parseBuildStats(result.stdout);
}

export async function updateWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  const result = await deps.exec(deps.graphifyPath, ['update', options.inputPath], {
    cwd: options.workspaceDir,
    env: deps.env,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify update failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  return parseBuildStats(result.stdout);
}

export async function mergeProfileGraph(deps: RunnerDeps, graphPaths: string[], outPath: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const result = await deps.exec(deps.graphifyPath, ['merge-graphs', ...graphPaths, '--out', outPath], {
    cwd: path.dirname(outPath),
    env: deps.env,
    timeoutMs: 10 * 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify merge-graphs failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
}
```

- [ ] **Step 5: Run all runtime tests → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/runtime
git commit -m "feat(graphify): graphify runner with stat parsing and backend credential env"
```

---

### Task 12: Runtime — indexer orchestrator

**Files:**
- Create: `plugins/sero-graphify-plugin/runtime/indexer.ts`
- Test: `plugins/sero-graphify-plugin/runtime/indexer.test.ts`

The indexer is pure orchestration against an injected `IndexerHost` so it tests without any host or filesystem.

- [ ] **Step 1: Write failing tests** (FakeHost records calls; in-memory state)

```ts
import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer, type IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexStats } from '../shared/types';

const STATS: WorkspaceIndexStats = { nodes: 10, edges: 20, communities: 2, inputTokens: 100, outputTokens: 50 };

function makeHost(overrides: Partial<IndexerHost> = {}) {
  let state: GraphifyState = structuredClone(DEFAULT_STATE);
  const host: IndexerHost = {
    readState: async () => structuredClone(state),
    updateState: async (updater) => { state = updater(structuredClone(state)); },
    listWorkspaces: async () => [
      { id: 'ws1', name: 'One', path: '/p/one', open: true },
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ],
    ensureProvisioned: vi.fn().mockResolvedValue(undefined),
    buildGraph: vi.fn().mockResolvedValue(STATS),
    updateGraph: vi.fn().mockResolvedValue(STATS),
    mergeProfileGraph: vi.fn().mockResolvedValue({ nodes: 20, edges: 40 }),
    log: () => {},
    ...overrides,
  };
  return { host, getState: () => state };
}

describe('GraphifyIndexer', () => {
  it('syncs the workspace list into state on start', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(Object.keys(getState().workspaces).sort()).toEqual(['ws1', 'ws2']);
    expect(getState().workspaces.ws1.enabled).toBe(false);
    indexer.dispose();
  });

  it('enable request triggers full build, stats, and profile merge', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({
      ...getState(),
      requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }],
    });
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws1']);
    expect(getState().workspaces.ws1).toMatchObject({ enabled: true, status: 'idle', stats: STATS });
    expect(getState().requests).toEqual([]);
    expect(getState().profileGraph.status).toBe('ready');
    indexer.dispose();
  });

  it('build failure lands in lastError without breaking the queue', async () => {
    const { host, getState } = makeHost();
    (host.buildGraph as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no key'));
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({
      ...getState(),
      requests: [
        { id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' },
        { id: 2, action: 'enable', workspaceId: 'ws2', requestedAt: 'now' },
      ],
    });
    await indexer.idle();
    expect(getState().workspaces.ws1).toMatchObject({ status: 'error', lastError: 'no key' });
    expect(getState().workspaces.ws2.status).toBe('idle'); // second job still ran
    indexer.dispose();
  });

  it('disable removes the workspace from merges', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 2, action: 'disable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    expect(getState().workspaces.ws1.enabled).toBe(false);
    indexer.dispose();
  });

  it('refreshAll runs incremental updates for enabled workspaces only', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    (host.updateGraph as ReturnType<typeof vi.fn>).mockClear();
    await indexer.refreshAll();
    await indexer.idle();
    expect(host.updateGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `indexer.ts`**

```ts
import type { GraphifyState, IndexRequest, WorkspaceIndexStats, WorkspaceIndexStatus } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

export interface IndexerWorkspace {
  id: string;
  name: string;
  path: string;
  open: boolean;
}

export interface IndexerHost {
  readState(): Promise<GraphifyState | null>;
  updateState(updater: (current: GraphifyState) => GraphifyState): Promise<void>;
  listWorkspaces(): Promise<IndexerWorkspace[]>;
  ensureProvisioned(): Promise<void>;
  buildGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings']): Promise<WorkspaceIndexStats>;
  updateGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings']): Promise<WorkspaceIndexStats>;
  mergeProfileGraph(workspaceIds: string[]): Promise<{ nodes: number; edges: number }>;
  log(message: string): void;
}

interface Job {
  workspaceId: string;
  full: boolean;
}

export class GraphifyIndexer {
  private queue: Job[] = [];
  private current: Promise<void> = Promise.resolve();
  private processing = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly host: IndexerHost) {}

  async start(): Promise<void> {
    await this.syncWorkspaceList();
    const state = await this.host.readState();
    // Catch up: anything enabled gets an incremental update; interrupted builds restart full.
    for (const entry of Object.values(state?.workspaces ?? {})) {
      if (entry.enabled) this.enqueue(entry.workspaceId, entry.status === 'building');
    }
    const minutes = state?.settings.refreshIntervalMinutes ?? DEFAULT_STATE.settings.refreshIntervalMinutes;
    if (minutes > 0) {
      this.refreshTimer = setInterval(() => void this.refreshAll(), minutes * 60_000);
    }
    this.kick();
  }

  async handleStateChange(rawState: unknown): Promise<void> {
    const state = rawState as GraphifyState | null;
    if (!state || !Array.isArray(state.requests) || state.requests.length === 0) return;
    const requests = [...state.requests];
    await this.host.updateState((current) => ({ ...current, requests: [] }));
    for (const request of requests) await this.applyRequest(request);
    this.kick();
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  /** Resolves when the queue drains. Test/diagnostic helper. */
  async idle(): Promise<void> {
    // The queue is processed serially on `current`; chaining awaits completion.
    let previous: Promise<void>;
    do {
      previous = this.current;
      await previous;
    } while (previous !== this.current);
  }

  async refreshAll(): Promise<void> {
    const state = await this.host.readState();
    for (const entry of Object.values(state?.workspaces ?? {})) {
      if (entry.enabled && entry.status === 'idle') this.enqueue(entry.workspaceId, false);
    }
    this.kick();
  }

  private async syncWorkspaceList(): Promise<void> {
    const workspaces = await this.host.listWorkspaces();
    await this.host.updateState((current) => {
      const state = current ?? structuredClone(DEFAULT_STATE);
      const next = { ...state, workspaces: { ...state.workspaces } };
      for (const ws of workspaces) {
        if (ws.id === 'global') continue;
        const existing = next.workspaces[ws.id];
        next.workspaces[ws.id] = existing
          ? { ...existing, name: ws.name, path: ws.path, status: existing.status === 'error' ? 'error' : 'idle' }
          : { workspaceId: ws.id, name: ws.name, path: ws.path, enabled: false, status: 'idle' };
      }
      for (const id of Object.keys(next.workspaces)) {
        if (!workspaces.some((ws) => ws.id === id)) delete next.workspaces[id];
      }
      return next;
    });
  }

  private async applyRequest(request: IndexRequest): Promise<void> {
    const enable = async (workspaceId: string, rebuild: boolean) => {
      await this.host.updateState((state) => {
        const entry = state.workspaces[workspaceId];
        if (!entry) return state;
        return { ...state, workspaces: { ...state.workspaces, [workspaceId]: { ...entry, enabled: true, status: 'queued', lastError: undefined } } };
      });
      this.enqueue(workspaceId, rebuild);
    };

    switch (request.action) {
      case 'enable':
      case 'rebuild':
        if (request.workspaceId) await enable(request.workspaceId, true);
        break;
      case 'refresh':
        if (request.workspaceId) await enable(request.workspaceId, false);
        break;
      case 'enable-all': {
        const state = await this.host.readState();
        for (const id of Object.keys(state?.workspaces ?? {})) await enable(id, true);
        break;
      }
      case 'disable':
        if (request.workspaceId) {
          this.queue = this.queue.filter((job) => job.workspaceId !== request.workspaceId);
          await this.host.updateState((state) => {
            const entry = state.workspaces[request.workspaceId!];
            if (!entry) return state;
            return { ...state, workspaces: { ...state.workspaces, [request.workspaceId!]: { ...entry, enabled: false, status: 'idle' } } };
          });
          await this.merge();
        }
        break;
    }
  }

  private enqueue(workspaceId: string, full: boolean): void {
    const existing = this.queue.find((job) => job.workspaceId === workspaceId);
    if (existing) {
      existing.full = existing.full || full;
      return;
    }
    this.queue.push({ workspaceId, full });
  }

  private kick(): void {
    if (this.processing || this.disposed) return;
    this.processing = true;
    this.current = this.current.then(async () => {
      try {
        while (this.queue.length > 0 && !this.disposed) {
          const job = this.queue.shift()!;
          await this.runJob(job);
        }
      } finally {
        this.processing = false;
      }
    });
  }

  private async setStatus(workspaceId: string, status: WorkspaceIndexStatus, patch: Partial<GraphifyState['workspaces'][string]> = {}): Promise<void> {
    await this.host.updateState((state) => {
      const entry = state.workspaces[workspaceId];
      if (!entry) return state;
      return { ...state, workspaces: { ...state.workspaces, [workspaceId]: { ...entry, ...patch, status } } };
    });
  }

  private async runJob(job: Job): Promise<void> {
    const state = await this.host.readState();
    const entry = state?.workspaces[job.workspaceId];
    if (!state || !entry?.enabled) return;

    await this.setStatus(job.workspaceId, job.full ? 'building' : 'updating');
    try {
      await this.host.ensureProvisioned();
      const target = { workspaceId: entry.workspaceId, path: entry.path };
      const stats = job.full
        ? await this.host.buildGraph(target, state.settings)
        : await this.host.updateGraph(target, state.settings);
      await this.setStatus(job.workspaceId, 'idle', { stats, lastBuiltAt: new Date().toISOString(), lastError: undefined });
      await this.merge();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.log(`[graphify] build failed for ${job.workspaceId}: ${message}`);
      await this.setStatus(job.workspaceId, 'error', { lastError: message });
    }
  }

  private async merge(): Promise<void> {
    const state = await this.host.readState();
    const ids = Object.values(state?.workspaces ?? {})
      .filter((entry) => entry.enabled && entry.lastBuiltAt)
      .map((entry) => entry.workspaceId);

    if (ids.length === 0) {
      await this.host.updateState((current) => ({ ...current, profileGraph: { status: 'absent' } }));
      return;
    }
    await this.host.updateState((current) => ({ ...current, profileGraph: { ...current.profileGraph, status: 'merging' } }));
    try {
      const { nodes, edges } = await this.host.mergeProfileGraph(ids);
      await this.host.updateState((current) => ({
        ...current,
        profileGraph: { status: 'ready', mergedAt: new Date().toISOString(), nodes, edges, workspaceIds: ids },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.host.updateState((current) => ({ ...current, profileGraph: { ...current.profileGraph, status: 'failed', error: message } }));
    }
  }
}
```

Note: scripts cannot use `Date.now()` restrictions don't apply here — that constraint is for Workflow scripts, not plugin code. `new Date().toISOString()` is fine.

- [ ] **Step 4: Run → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/runtime
git commit -m "feat(graphify): indexer orchestrator with single-flight queue and profile merge"
```

---

### Task 13: Runtime — entry wiring

**Files:**
- Create: `plugins/sero-graphify-plugin/runtime/index.ts`
- Create: `plugins/sero-graphify-plugin/runtime/host-adapter.ts`
- Verify `package.json` already declares `sero.app.runtime` and `appRuntime.background` (Task 2 did).

- [ ] **Step 1: Implement `host-adapter.ts`** (binds ctx.host to IndexerHost; provisioning state writes live here)

```ts
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { GraphifyState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { graphifyPathsFromHome, workspaceGraphDir, workspaceGraphJson, type GraphifyPaths } from '../shared/paths';
import { boundedExec } from './bounded-exec';
import { provisionGraphify, graphifyBinPath, uvEnv } from './provisioner';
import { buildWorkspaceGraph, updateWorkspaceGraph, mergeProfileGraph as runMerge } from './graphify-runner';
import { extractionEnv } from './credentials';
import { loadGraph } from '../shared/query-engine';
import type { IndexerHost } from './indexer';

export function createIndexerHost(ctx: AppRuntimeContext): { host: IndexerHost; paths: GraphifyPaths } {
  const paths = graphifyPathsFromHome(path.dirname(ctx.stateFilePath));
  let provisioned: { graphifyPath: string } | null = null;

  const readState = async () => (await ctx.host.appState.read<GraphifyState>(ctx.stateFilePath)) ?? null;
  const updateState = (updater: (current: GraphifyState) => GraphifyState) =>
    ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => updater(current ?? structuredClone(DEFAULT_STATE)));

  const ensureProvisioned = async (): Promise<void> => {
    if (provisioned) return;
    await updateState((state) => ({ ...state, provisioning: { ...state.provisioning, status: 'installing', updatedAt: new Date().toISOString() } }));
    try {
      const result = await provisionGraphify({
        ensureUv: async () => (await ctx.host.toolchains.ensure('uv')).path,
        exec: boundedExec,
        toolsDir: paths.toolsDir,
      });
      provisioned = result;
      await updateState((state) => ({
        ...state,
        provisioning: { status: 'ready', uvPath: result.uvPath, graphifyPath: result.graphifyPath, version: result.version, updatedAt: new Date().toISOString() },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateState((state) => ({ ...state, provisioning: { status: 'failed', error: message, updatedAt: new Date().toISOString() } }));
      throw error;
    }
  };

  const runnerDeps = async (settings: GraphifyState['settings']) => ({
    exec: boundedExec,
    graphifyPath: provisioned?.graphifyPath ?? graphifyBinPath(paths.toolsDir),
    env: await extractionEnv(settings.backend, (providerId) => ctx.host.credentials.getProviderApiKey(providerId), uvEnv(paths.toolsDir)),
  });

  const host: IndexerHost = {
    readState,
    updateState,
    listWorkspaces: () => ctx.host.workspace.list(),
    ensureProvisioned,
    buildGraph: async (workspace, settings) =>
      buildWorkspaceGraph(await runnerDeps(settings), {
        workspaceDir: workspaceGraphDir(paths, workspace.workspaceId),
        inputPath: workspace.path,
        backend: settings.backend,
        tokenBudget: settings.tokenBudget,
        exclude: settings.exclude,
      }),
    updateGraph: async (workspace, settings) =>
      updateWorkspaceGraph(await runnerDeps(settings), {
        workspaceDir: workspaceGraphDir(paths, workspace.workspaceId),
        inputPath: workspace.path,
        backend: settings.backend,
        tokenBudget: settings.tokenBudget,
        exclude: settings.exclude,
      }),
    mergeProfileGraph: async (workspaceIds) => {
      const settings = (await readState())?.settings ?? DEFAULT_STATE.settings;
      const deps = await runnerDeps(settings);
      await runMerge(deps, workspaceIds.map((id) => workspaceGraphJson(paths, id)), paths.profileGraph);
      const merged = await loadGraph(paths.profileGraph);
      return { nodes: merged?.nodes.size ?? 0, edges: merged?.edgeCount ?? 0 };
    },
    log: (message) => console.log(message),
  };

  return { host, paths };
}
```

(Note: `mergeProfileGraph` builds an extraction env it doesn't strictly need; if `extractionEnv` throws for a missing key during merge-only operations, refactor `runnerDeps` to take `requireKey: boolean` and skip key injection for merges — merges are local-only.) Implement that refinement now:  pass `uvEnv(paths.toolsDir)` directly as `env` for the merge deps instead of `extractionEnv(...)`.

- [ ] **Step 2: Implement `runtime/index.ts`**

```ts
import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import { GraphifyIndexer } from './indexer';
import { createIndexerHost } from './host-adapter';

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const { host } = createIndexerHost(ctx);
  const indexer = new GraphifyIndexer(host);
  return {
    start: () => indexer.start(),
    handleStateChange: (state) => indexer.handleStateChange(state),
    dispose: () => indexer.dispose(),
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
```

(Match the exact `AppRuntime`/`AppRuntimeModule` export shape in `packages/common/src/app-runtime-background.ts:352-360`.)

- [ ] **Step 3: Typecheck + tests + commit**

Run: `pnpm --filter @sero-ai/plugin-graphify typecheck && pnpm --filter @sero-ai/plugin-graphify test`

```bash
git add plugins/sero-graphify-plugin
git commit -m "feat(graphify): background runtime wiring (provisioning, indexing, merging)"
```

---

### Task 14: Extension — tools

**Files:**
- Modify: `plugins/sero-graphify-plugin/extension/index.ts`
- Create: `plugins/sero-graphify-plugin/extension/current-workspace.ts` + `current-workspace.test.ts`
- Create: `plugins/sero-graphify-plugin/shared/state-io.ts` + `state-io.test.ts`

Mirror tool-registration syntax from `plugins/sero-git-plugin/extension/index.ts` (single tool + execute handler) — use `pi.registerTool`, TypeBox schemas, `StringEnum` from `@earendil-works/pi-ai` for enums. All tools are bridged to `sero <tool>` automatically (no `bridgeTools` field = bridge all).

- [ ] **Step 1: TDD `shared/state-io.ts`** — atomic JSON read/write + request append:

Test:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readStateFile, appendIndexRequest } from './state-io';
import { DEFAULT_STATE } from './types';

describe('state-io', () => {
  it('returns null for missing state', async () => {
    expect(await readStateFile('/nonexistent/state.json')).toBeNull();
  });

  it('appends requests atomically with incrementing ids', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-state-'));
    const stateFile = path.join(dir, 'state.json');
    const first = await appendIndexRequest(stateFile, 'enable', 'ws1');
    const second = await appendIndexRequest(stateFile, 'rebuild', 'ws1');
    expect(first).toBe(1);
    expect(second).toBe(2);
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(state.requests).toHaveLength(2);
    expect(state.settings).toEqual(DEFAULT_STATE.settings);
  });
});
```

Implementation:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_STATE, type GraphifyState, type IndexAction } from './types';

export async function readStateFile(stateFile: string): Promise<GraphifyState | null> {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8')) as GraphifyState;
  } catch {
    return null;
  }
}

export async function writeStateFile(stateFile: string, state: GraphifyState): Promise<void> {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await rename(temp, stateFile);
}

export async function appendIndexRequest(stateFile: string, action: IndexAction, workspaceId?: string): Promise<number> {
  const current = (await readStateFile(stateFile)) ?? structuredClone(DEFAULT_STATE);
  const id = current.nextRequestId;
  const next: GraphifyState = {
    ...current,
    nextRequestId: id + 1,
    requests: [...current.requests, { id, action, workspaceId, requestedAt: new Date().toISOString() }],
  };
  await writeStateFile(stateFile, next);
  return id;
}
```

- [ ] **Step 2: TDD `extension/current-workspace.ts`**

Test:

```ts
import { describe, expect, it } from 'vitest';
import { resolveCurrentWorkspace } from './current-workspace';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';

const state: GraphifyState = {
  ...structuredClone(DEFAULT_STATE),
  workspaces: {
    ws1: { workspaceId: 'ws1', name: 'One', path: '/home/me/projects/one', enabled: true, status: 'idle' },
    ws2: { workspaceId: 'ws2', name: 'Two', path: '/home/me/projects/two', enabled: true, status: 'idle' },
  },
};

describe('resolveCurrentWorkspace', () => {
  it('prefers SERO_WORKSPACE_ID env', () => {
    expect(resolveCurrentWorkspace(state, '/anything', { SERO_WORKSPACE_ID: 'ws2' })?.workspaceId).toBe('ws2');
  });
  it('matches by host path prefix', () => {
    expect(resolveCurrentWorkspace(state, '/home/me/projects/one/src', {})?.workspaceId).toBe('ws1');
  });
  it('falls back to basename match (container /workspace cwd)', () => {
    expect(resolveCurrentWorkspace(state, '/workspace', {})).toBeNull(); // ambiguous basename → null
    expect(resolveCurrentWorkspace(state, '/two', {})?.workspaceId).toBe('ws2');
  });
});
```

Implementation:

```ts
import path from 'node:path';
import type { GraphifyState, WorkspaceIndexEntry } from '../shared/types';

/** Best-effort mapping of the session cwd to a profile workspace. Null when ambiguous. */
export function resolveCurrentWorkspace(
  state: GraphifyState,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceIndexEntry | null {
  if (env.SERO_WORKSPACE_ID && state.workspaces[env.SERO_WORKSPACE_ID]) {
    return state.workspaces[env.SERO_WORKSPACE_ID];
  }
  const entries = Object.values(state.workspaces);
  const byPath = entries.find((e) => cwd === e.path || cwd.startsWith(e.path + path.sep));
  if (byPath) return byPath;
  const base = path.basename(cwd);
  const byBase = entries.filter((e) => path.basename(e.path) === base);
  return byBase.length === 1 ? byBase[0] : null;
}
```

(E2E in Task 17 verifies whether `SERO_WORKSPACE_ID` exists in session env; the function degrades gracefully either way.)

- [ ] **Step 3: Implement the tools in `extension/index.ts`**

```ts
import { Type } from 'typebox';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveGraphifyPaths, workspaceGraphJson } from '../shared/paths';
import { readStateFile, appendIndexRequest } from '../shared/state-io';
import { loadGraph, queryGraph, findPath, explainNode } from '../shared/query-engine';
import { resolveCurrentWorkspace } from './current-workspace';
import { registerAutoContext } from './auto-context';

export default function graphifyExtension(pi: ExtensionAPI): void {
  const paths = resolveGraphifyPaths();

  pi.registerTool({
    name: 'graphify_search',
    description: 'Search the profile-wide knowledge graph spanning ALL indexed workspaces. Use for cross-project questions, architecture overviews, and finding which workspace owns a concept.',
    parameters: Type.Object({
      question: Type.String({ description: 'Natural-language question or concept keywords' }),
      mode: Type.Optional(StringEnum(['bfs', 'dfs'], { description: 'bfs = broad context (default), dfs = trace a specific chain' })),
      budget: Type.Optional(Type.Number({ description: 'Max answer tokens (default 1200)' })),
    }),
    async execute({ question, mode, budget }) {
      const graph = await loadGraph(paths.profileGraph);
      if (!graph) return { output: 'Profile graph not built yet. Enable workspace indexing in the Graphify panel or run: sero graphify_index enable-all' };
      return { output: queryGraph(graph, question, { mode, budget }) };
    },
  });

  pi.registerTool({
    name: 'graphify_query',
    description: 'Query the knowledge graph of the CURRENT workspace (falls back to the profile graph when the workspace is not indexed).',
    parameters: Type.Object({
      question: Type.String(),
      mode: Type.Optional(StringEnum(['bfs', 'dfs'])),
      budget: Type.Optional(Type.Number()),
    }),
    async execute({ question, mode, budget }, ctx) {
      const state = await readStateFile(paths.stateFile);
      const entry = state ? resolveCurrentWorkspace(state, ctx.cwd) : null;
      const graphPath = entry ? workspaceGraphJson(paths, entry.workspaceId) : paths.profileGraph;
      const graph = (await loadGraph(graphPath)) ?? (await loadGraph(paths.profileGraph));
      if (!graph) return { output: 'No graph available for this workspace yet. Enable indexing in the Graphify panel.' };
      return { output: queryGraph(graph, question, { mode, budget }) };
    },
  });

  pi.registerTool({
    name: 'graphify_path',
    description: 'Find the shortest connection between two concepts in the profile knowledge graph.',
    parameters: Type.Object({ from: Type.String(), to: Type.String() }),
    async execute({ from, to }) {
      const graph = await loadGraph(paths.profileGraph);
      if (!graph) return { output: 'Profile graph not built yet.' };
      return { output: findPath(graph, from, to) };
    },
  });

  pi.registerTool({
    name: 'graphify_explain',
    description: 'Plain-language explanation of a single concept/node: everything connected to it.',
    parameters: Type.Object({ concept: Type.String() }),
    async execute({ concept }) {
      const graph = await loadGraph(paths.profileGraph);
      if (!graph) return { output: 'Profile graph not built yet.' };
      return { output: explainNode(graph, concept) };
    },
  });

  pi.registerTool({
    name: 'graphify_status',
    description: 'Show graphify index status for all workspaces in the profile.',
    parameters: Type.Object({}),
    async execute() {
      const state = await readStateFile(paths.stateFile);
      if (!state) return { output: 'Graphify has no state yet — open the Graphify panel to get started.' };
      const lines = [`Provisioning: ${state.provisioning.status}${state.provisioning.error ? ` (${state.provisioning.error})` : ''}`];
      lines.push(`Profile graph: ${state.profileGraph.status}${state.profileGraph.nodes ? ` — ${state.profileGraph.nodes} nodes / ${state.profileGraph.edges} edges` : ''}`);
      for (const entry of Object.values(state.workspaces)) {
        const stats = entry.stats ? ` ${entry.stats.nodes}n/${entry.stats.edges}e` : '';
        lines.push(`• ${entry.name} [${entry.enabled ? entry.status : 'disabled'}]${stats}${entry.lastError ? ` — ${entry.lastError}` : ''}`);
      }
      return { output: lines.join('\n') };
    },
  });

  pi.registerTool({
    name: 'graphify_index',
    description: 'Manage workspace indexing: enable, disable, rebuild, refresh a workspace, or enable-all. Builds run in the background; check progress with graphify_status.',
    parameters: Type.Object({
      action: StringEnum(['enable', 'disable', 'rebuild', 'refresh', 'enable-all']),
      workspace: Type.Optional(Type.String({ description: 'Workspace id or name (omit for enable-all, or to target the current workspace)' })),
    }),
    async execute({ action, workspace }, ctx) {
      const state = await readStateFile(paths.stateFile);
      let workspaceId: string | undefined;
      if (action !== 'enable-all') {
        const entries = Object.values(state?.workspaces ?? {});
        const entry = workspace
          ? entries.find((e) => e.workspaceId === workspace || e.name === workspace)
          : state ? resolveCurrentWorkspace(state, ctx.cwd) : null;
        if (!entry) return { output: `Could not resolve workspace${workspace ? ` "${workspace}"` : ' from cwd'}. Known: ${entries.map((e) => e.workspaceId).join(', ') || '(none — runtime not started yet)'}` };
        workspaceId = entry.workspaceId;
      }
      const id = await appendIndexRequest(paths.stateFile, action, workspaceId);
      return { output: `Queued ${action}${workspaceId ? ` for ${workspaceId}` : ''} (request #${id}). Track with graphify_status.` };
    },
  });

  registerAutoContext(pi, paths);
}
```

(`registerAutoContext` is added in Task 15 — until then add a temporary no-op export in `extension/auto-context/index.ts`: `export function registerAutoContext(): void {}` so this compiles, replaced next task. Match `execute` return shape and `ctx.cwd` access to how `sero-git-plugin`'s tools do it — adjust if its SDK signature differs.)

- [ ] **Step 4: Run tests + typecheck → PASS, commit**

```bash
git add plugins/sero-graphify-plugin
git commit -m "feat(graphify): agent tools — search/query/path/explain/status/index"
```

---

### Task 15: Extension — auto-context port

**Files:**
- Create: `plugins/sero-graphify-plugin/extension/auto-context/` (port of `/Users/danielcarter/Documents/Dev/projects/sero/repos/pi-github-repos/pi-graphify/src/auto-context/`)

Source modules: `intent.ts` (intent classification of tool results), `augment.ts` (appending hints, budgets, dedup LRU), `state.ts` (per-session counters), `graph-state.ts` (graph presence/paths), `auto-query.ts` (optional auto-query), `index.ts` (hook wiring) — each with a `.test.ts`.

- [ ] **Step 1: Copy all six modules + tests** from the pi-graphify path above into `extension/auto-context/`.

- [ ] **Step 2: Apply these adaptations (each is a find-and-replace-scale edit):**

1. **Config source:** pi-graphify reads settings from `prime-settings.json` via its `src/config.ts`. Replace with our state file: add `extension/auto-context/settings.ts`:

```ts
import { readStateFile } from '../../shared/state-io';
import { DEFAULT_STATE, type AutoContextSettings } from '../../shared/types';

export async function loadAutoContextSettings(stateFile: string): Promise<AutoContextSettings> {
  const state = await readStateFile(stateFile);
  return state?.settings.autoContext ?? DEFAULT_STATE.settings.autoContext;
}
```

Replace every `config.autoContext.*` read with the loaded settings object. Settings not in our `AutoContextSettings` (e.g. `minToolResultLines`, `triggerTools`, `triggerPatterns`, `reportMaxChars`, `queryBudget`) keep pi-graphify's defaults as local constants in the module that uses them.

2. **Graph location:** `graph-state.ts` looks for `<cwd>/graphify-out/graph.json`. Replace with sero paths: current workspace graph via `resolveCurrentWorkspace` + `workspaceGraphJson`, falling back to `paths.profileGraph`. Session orientation reads `workspaceGraphReport(paths, id)` for the report and the profile graph stats from state.

3. **Auto-query:** `auto-query.ts` shells out to `graphify query`. Replace the exec call with the TS engine: `loadGraph(...)` + `queryGraph(graph, question, { budget })`. Delete the exec-adapter import.

4. **Hook wiring:** `index.ts` exports `registerAutoContext(pi, paths)` that wires the same Pi events pi-graphify uses (session start hint injection + tool-result augmentation). Keep the event names/registration calls exactly as in the source — they are standard Pi extension APIs and Sero runs standard Pi.

5. **Idle behavior:** every entry point first checks graph presence (profile graph or current-workspace graph). No graph → return without doing anything (this preserves pi-graphify's "stays idle when no graph exists" behavior).

- [ ] **Step 3: Adapt the copied tests** to the new settings/paths seams (the assertion logic — budgets, dedup, intent classification — stays identical). Replace the no-op `registerAutoContext` stub from Task 14 with the real export.

- [ ] **Step 4: Run all plugin tests + typecheck → PASS, commit**

```bash
git add plugins/sero-graphify-plugin/extension
git commit -m "feat(graphify): auto-context — session orientation and intent-aware hints"
```

---

### Task 16: UI — management panel

**Files:**
- Create: `plugins/sero-graphify-plugin/ui/GraphifyApp.tsx`
- Create: `plugins/sero-graphify-plugin/ui/styles.css`, `ui/index.html`, `ui/tsconfig.json`, `ui/vite-env.d.ts`
- Create: `plugins/sero-graphify-plugin/vite.config.ts`

Copy `vite.config.ts`, `ui/index.html`, `ui/tsconfig.json`, `ui/vite-env.d.ts`, `ui/styles.css` from `plugins/sero-admin-plugin/` and adjust: MF remote name `sero_graphify`, exposed module `./GraphifyApp`, dev port **5197**, `@source "./**/*.{ts,tsx}"` in styles.

- [ ] **Step 1: Implement `GraphifyApp.tsx`**

```tsx
import { useState } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { Badge, Button, Card, Input, Switch } from '@sero-ai/ui';
import { Loader2, RefreshCw, Search, Waypoints } from 'lucide-react';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexEntry } from '../shared/types';
import './styles.css';

function statusBadge(entry: WorkspaceIndexEntry) {
  if (!entry.enabled) return <Badge variant="outline">off</Badge>;
  switch (entry.status) {
    case 'building': return <Badge>building…</Badge>;
    case 'updating': return <Badge>updating…</Badge>;
    case 'queued': return <Badge variant="secondary">queued</Badge>;
    case 'error': return <Badge variant="destructive">error</Badge>;
    default: return <Badge variant="secondary">indexed</Badge>;
  }
}

export function GraphifyApp() {
  const [state] = useAppState<GraphifyState>(DEFAULT_STATE);
  const { run } = useAppTools();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const workspaces = Object.values(state.workspaces);
  const index = (action: string, workspaceId?: string) =>
    void run('graphify_index', { action, workspace: workspaceId });

  const search = async () => {
    if (!question.trim()) return;
    setSearching(true);
    try {
      const result = await run('graphify_search', { question });
      setAnswer(typeof result === 'string' ? result : (result as { output?: string })?.output ?? JSON.stringify(result));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-background p-4 text-foreground">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Graphify</h1>
          <Badge variant="outline">{state.provisioning.status}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => index('enable-all')}>Index all</Button>
      </header>

      {state.provisioning.status === 'failed' && (
        <Card className="border-destructive p-3 text-base">{state.provisioning.error}</Card>
      )}

      <Card className="p-3">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            placeholder="Search across all indexed workspaces…"
          />
          <Button onClick={() => void search()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {answer !== null && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{answer}</pre>}
        <p className="mt-2 text-xs text-muted-foreground">
          Profile graph: {state.profileGraph.status}
          {state.profileGraph.nodes ? ` — ${state.profileGraph.nodes} nodes, ${state.profileGraph.edges} edges` : ''}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        {workspaces.length === 0 && (
          <p className="text-base text-muted-foreground">No workspaces discovered yet — the background runtime populates this list on startup.</p>
        )}
        {workspaces.map((entry) => (
          <Card key={entry.workspaceId} className="flex items-center justify-between p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{entry.name}</span>
                {statusBadge(entry)}
              </div>
              <p className="truncate text-xs text-muted-foreground">{entry.path}</p>
              {entry.stats && (
                <p className="text-xs text-muted-foreground">
                  {entry.stats.nodes} nodes · {entry.stats.edges} edges · {entry.stats.communities} communities
                  {entry.stats.inputTokens > 0 && ` · ${Math.round((entry.stats.inputTokens + entry.stats.outputTokens) / 1000)}k tokens used`}
                </p>
              )}
              {entry.lastError && <p className="text-xs text-destructive">{entry.lastError}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="ghost" title="Rebuild" disabled={!entry.enabled} onClick={() => index('rebuild', entry.workspaceId)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Switch checked={entry.enabled} onCheckedChange={(on) => index(on ? 'enable' : 'disable', entry.workspaceId)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default GraphifyApp;
```

(Adjust `@sero-ai/ui` component names to whatever that package actually exports — check `plugins/sero-admin-plugin/ui/` imports and mirror them; `Switch`/`Badge`/`Card`/`Input`/`Button` are the expected set.)

- [ ] **Step 2: Build + typecheck**

Run: `pnpm --filter @sero-ai/plugin-graphify build && pnpm --filter @sero-ai/plugin-graphify typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-graphify-plugin
git commit -m "feat(graphify): management UI panel with profile-wide search"
```

---

### Task 17: Verification, E2E, docs

**Files:**
- Create: `plugins/sero-graphify-plugin/README.md`
- Modify: spike notes with E2E results

- [ ] **Step 1: Full local verification**

```bash
pnpm install
pnpm --filter @sero-ai/common typecheck
pnpm --filter @sero/desktop typecheck && pnpm --filter @sero/desktop test
pnpm --filter @sero-ai/plugin-graphify typecheck && pnpm --filter @sero-ai/plugin-graphify test && pnpm --filter @sero-ai/plugin-graphify build
bash scripts/build-plugin.sh plugins/sero-graphify-plugin
```

All must pass.

- [ ] **Step 2: E2E (dev app)**

```bash
cd apps/desktop && SERO_DEV_PLUGINS=graphify bash scripts/dev.sh
```

Checklist (record outcomes in the spike notes file):
1. Graphify appears in the sidebar; panel lists profile workspaces (runtime started → `/tmp/sero-electron.log` shows no `[app-runtime]` errors for `graphify:global`).
2. Enable a small **host-mode** workspace → status walks queued → building → indexed; stats appear; `~/.sero-ui/apps/graphify/graphs/<id>/graphify-out/graph.json` exists. First enable on a machine without system uv exercises the managed uv install (temporarily `mv ~/.local/bin/uv{,.bak}` to test).
3. Enable a **container** workspace → same flow (build runs host-side regardless).
4. Profile graph: `~/.sero-ui/apps/graphify/profile/graph.json` exists after second build; panel shows merged stats.
5. In a **host-mode** session: `graphify_status`, `graphify_search "<cross-workspace question>"`, `graphify_query`, `graphify_path`, `graphify_explain` all answer. `sero graphify_search ...` works from the CLI bridge.
6. In a **container** session: `graphify_search` works (= SERO_HOME graphs readable in-container — **spike item 2 resolved**; if NOT readable, record it and file the follow-up: add the graphify dir to the container's internal mounts; tools degrade to "not available in this session" meanwhile). `graphify_index enable` from the container session works (state write) — if read-only, verify the tool returns its graceful error and index management remains UI-only.
7. Auto-context: new session in an indexed workspace shows the `[Graphify active]` orientation; a broad `grep`-style tool result gets a graphify hint appended; budgets cap repeats. Check whether `SERO_WORKSPACE_ID` is present in session env (step 5's `graphify_status` resolution) and record it.
8. Error path: disable network or remove the API key → enable a workspace → entry shows `error` with the missing-key message; re-enable after fixing → recovers.

- [ ] **Step 3: Write `plugins/sero-graphify-plugin/README.md`** — short: what it does, opt-in indexing model, tools table (6 tools), settings reference (backend, tokenBudget, exclude, refreshIntervalMinutes, autoContext.*), storage layout under `SERO_HOME/apps/graphify/`, credits to upstream Graphify + pi-graphify.

- [ ] **Step 4: Final commit**

```bash
git add plugins/sero-graphify-plugin/README.md docs/superpowers/plans/2026-06-10-graphify-spike-notes.md
git commit -m "docs(graphify): plugin README and E2E verification notes"
```

---

## Self-review notes

- **Spec coverage:** host-side indexing (T10–13), uv toolchain (T5–6), TS query engine (T7–8), opt-in + auto-refresh via interval loop + on-start catch-up (T12 — the spec's "debounced file-watch" is implemented as the interval-based incremental refresh; `graphify update` is a cheap no-op when nothing changed, and the interval is configurable. This simplification is deliberate: recursive fs-watching of every workspace from the host is platform-fragile and YAGNI for v1), credentials seam (T4), tools + CLI bridge (T14), auto-context (T15), UI (T16), spikes (T1, T17 step 2.6), cost controls (settings + stats parsing, T11), error handling (bounded exec T9, per-entry errors T12).
- **Out of scope per spec:** graph viz, dashboard widget, `graphify add`, git hooks, exports — none planned.
- **Known judgment points for the implementer:** exact `ExtensionAPI` signatures (mirror sero-git-plugin), `@sero-ai/ui` export names (mirror sero-admin-plugin), archives.ts unpack layout for uv binPaths (T5 step 4), SERO_HOME resolver export name (T4 step 2).
