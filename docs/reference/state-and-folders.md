# Sero / Pi SDK — Folder & State Analysis

> **Date:** 2026-02-15  
> **Goal:** Understand where Sero and Pi SDK store data, identify overlap and
> confusion, and chart a path to a single unified `~/.sero-ui/` root.

---

## 1. Current Folder Inventory

### 1.1 `~/.pi/agent/` — Pi SDK global config

Created automatically by the Pi CLI on first run. The SDK's `getAgentDir()`
defaults to `~/.pi/agent` unless `PI_CODING_AGENT_DIR` env var is set.

| Path | Purpose | Used by Sero? |
|------|---------|---------------|
| `settings.json` | Default provider, model, thinking level, **packages list** | **Yes** — Sero reads `agentDir: PI_AGENT_DIR` in `shared-infra.ts`, `agent.ts`, `app-discovery.ts` |
| `auth.json` | OAuth tokens & API keys (Anthropic, OpenAI, Google, etc.) | **Yes** — `AuthStorage(PI_AGENT_DIR + '/auth.json')` in `shared-infra.ts` |
| `extensions/` | MCP configs, extension JSON stubs | Scanned by `app-discovery.ts` |
| `skills/` | Skill markdown & helper files (playwright, browser-tools, etc.) | **Yes** — `DefaultResourceLoader` discovers from `agentDir` |
| `prompts/` | Reusable prompt templates | **Yes** — same discovery |
| `sessions/` | Pi CLI session .jsonl files (keyed by cwd) | **No** — Sero stores its sessions separately |
| `bin/` | Managed binaries (fd, rg) | Yes — tools use these |
| `npm-global/` | npm-installed pi packages (symlinks) | Indirectly — packages are resolved through here |
| `models.json` | Custom model definitions | Yes — `ModelRegistry` reads from `agentDir/models.json` |

**Key point:** Sero explicitly hardcodes `PI_AGENT_DIR = ~/.pi/agent` in
`shared-infra.ts` and passes it to every `createAgentSession()` and
`DefaultResourceLoader()`. It does **not** use the `PI_CODING_AGENT_DIR` env
var.

### 1.2 `~/.sero-ui/` — Sero's own config & data

Created by Sero's `WorkspaceManager` on first run and `loadSeroEnv()`.

| Path | Purpose | Overlap? |
|------|---------|----------|
| `agent/.env` | API keys for Sero tools (TAVILY, FIRECRAWL) | Unique to Sero |
| `agent/auth.json` | **Duplicate** Anthropic OAuth token | ⚠️ **Overlap** — stale copy, different token state vs `~/.pi/agent/auth.json` |
| `agent/sessions/` | Sero chat session .jsonl files (flat, all workspaces) | Unique to Sero |
| `agent/workspaces.json` | Workspace registry (ids, paths, open flags) | Unique to Sero |
| `agent/settings.json` | Sero-specific settings (hiddenCommands) | Does NOT exist yet (read attempted, returns empty) |
| `workspaces/global/` | Default global workspace + `AGENTS.md`, `memories.md` | Unique |
| `workspaces/global/.sero/apps/*/state.json` | App state per workspace | Unique |

### 1.3 `~/.volta/` — Node version manager (Volta)

Volta manages Node.js versions. Pi packages installed via `pi install npm:...`
end up as global npm packages under Volta's managed Node:

```
~/.volta/tools/image/node/22.22.0/lib/node_modules/
  ├── pi-planning-with-files/
  ├── pi-mcp-adapter/
  ├── pi-subagents/
  └── @benvargas/pi-firecrawl-mcp/
```

**This is NOT Sero-specific.** Volta is just where global npm packages live when
Volta is the Node manager. The Pi SDK discovers packages from the
`settings.json` `packages` array, resolves `npm:` prefixed entries via the
standard Node module resolution (which finds them in Volta's global
`node_modules`).

**No action needed for Volta** — it's infrastructure, not a Sero config
location. If you change the `PI_CODING_AGENT_DIR`, the packages array in the
settings.json at the new location controls what gets loaded. The actual npm
package files stay in Volta's `node_modules` regardless.

### 1.4 `~/Library/Application Support/sero/` — Electron app data

Standard macOS Electron userData directory. Contains:

- `Cache/`, `GPUCache/`, `DawnGraphiteCache/` — Chromium caches
- `Session Storage/` — Chromium session storage (DOM)
- `Preferences` — Electron window state
- `WebStorage/` — Chromium web storage

**This is Electron infrastructure.** Not application state. Controlled by
`app.getPath('userData')`. Can be left as-is — it's the standard macOS pattern
for desktop apps.

---

## 2. Problems Identified

### 2.1 Duplicate auth.json ⚠️

Two separate `auth.json` files:

| Location | Tokens |
|----------|--------|
| `~/.pi/agent/auth.json` | Anthropic, OpenAI Codex, Google Gemini CLI, OpenRouter |
| `~/.sero-ui/agent/auth.json` | Anthropic only (older/stale token) |

**How it happened:** `shared-infra.ts` creates `AuthStorage` pointing at
`~/.pi/agent/auth.json` (correct). But somewhere Sero also wrote an
`auth.json` into `~/.sero-ui/agent/` — possibly an earlier version that used
a different path, or from copying the file manually. The Sero code currently
reads from `~/.pi/agent/auth.json`, so the `~/.sero-ui/` copy is orphaned
and confusing.

**Risk:** If code is ever changed to read from `~/.sero-ui/agent/auth.json`,
it will find a stale Anthropic token and miss OpenAI/Google/OpenRouter
credentials entirely.

### 2.2 Duplicate / split settings.json ⚠️

| Location | Contents |
|----------|----------|
| `~/.pi/agent/settings.json` | `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, **packages list** |
| `~/.sero-ui/agent/settings.json` | Does not exist yet (only `hiddenCommands` planned) |

The Pi CLI's `settings.json` contains the `packages` array that lists
Sero app extensions (todo, weight-tracker, daily-quote). This means:

- **Installing a new Sero app** requires editing `~/.pi/agent/settings.json`
- **The Pi CLI and Sero share the same packages list** — they can't diverge
- Sero's `SettingsManager.create()` receives `(~/.sero-ui, ~/.pi/agent)` but
  the settings file is read from `agentDir` (second arg), i.e. `~/.pi/agent`

### 2.3 Unclear AGENTS.md hierarchy ⚠️

The Pi SDK loads AGENTS.md from these locations (in order):

1. `~/.pi/agent/AGENTS.md` — global (Pi CLI only, not used by Sero currently)
2. Parent directories walking up from `cwd`
3. `cwd` itself

Sero's additions:
- `~/.sero-ui/workspaces/global/AGENTS.md` — manually injected via
  `agentsFilesOverride` in `agent.ts` as a "base context" for all sessions
- Each workspace's own `AGENTS.md` (discovered via cwd walk-up since the
  workspace path IS the cwd)

**Problem:** If someone puts an `AGENTS.md` at `~/.pi/agent/AGENTS.md`, it
won't be loaded by Sero because Sero uses workspace paths as cwd, which are
under `~/.sero-ui/workspaces/` — the walk-up never reaches `~/.pi/agent/`.

Meanwhile the Pi CLI WOULD load `~/.pi/agent/AGENTS.md` (global scope). So
the same user gets different agent context depending on whether they use Pi
CLI or Sero, which is confusing.

### 2.4 App discovery reads from `~/.pi/agent` ⚠️

`app-discovery.ts` scans:
1. `~/.pi/agent/extensions/` for sero app manifests
2. `~/.pi/agent/settings.json` packages list
3. `~/.pi/agent/packages/` for installed packages
4. Manually registered paths (dev mode)

This means Sero app discovery is fully dependent on the Pi CLI's config
directory. A user who never installs the Pi CLI would have no
`~/.pi/agent/settings.json` and app discovery would find nothing.

### 2.5 Sessions are cleanly separated ✅

This is actually done correctly:
- Pi CLI: `~/.pi/agent/sessions/` (keyed by cwd)
- Sero: `~/.sero-ui/agent/sessions/` (flat, workspace-tagged)

No overlap here.

### 2.6 App state is cleanly scoped ✅

App state lives in `~/.sero-ui/workspaces/<id>/.sero/apps/<app>/state.json`.
This is workspace-specific and well-structured. No issues.

---

## 3. How `PI_CODING_AGENT_DIR` Works

From the SDK source (`config.js`):

```js
export function getAgentDir() {
    const envDir = process.env[ENV_AGENT_DIR]; // PI_CODING_AGENT_DIR
    if (envDir) {
        if (envDir === "~") return homedir();
        if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
        return envDir;
    }
    return join(homedir(), CONFIG_DIR_NAME, "agent"); // ~/.pi/agent
}
```

Everything in the SDK derives from `getAgentDir()`:
- `auth.json` → `getAgentDir() + /auth.json`
- `settings.json` → `getAgentDir() + /settings.json`
- `sessions/` → `getAgentDir() + /sessions/`
- `extensions/` → `getAgentDir() + /extensions/`
- `skills/` → `getAgentDir() + /skills/`
- `prompts/` → `getAgentDir() + /prompts/`
- `models.json` → `getAgentDir() + /models.json`
- `bin/` → `getAgentDir() + /bin/`

**However**, Sero bypasses `getAgentDir()` entirely — it hardcodes
`PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent')` and passes it
explicitly as `agentDir` to every SDK call. The SDK respects explicit
`agentDir` params over `getAgentDir()`.

**Important caveat:** Some SDK code paths (e.g. `ModelRegistry` constructor,
`AuthStorage` constructor) have default parameters that call `getAgentDir()`.
If Sero passes explicit paths, those defaults are bypassed. But any SDK code
that uses `getAgentDir()` internally without an explicit override will still
look at `~/.pi/agent/` unless `PI_CODING_AGENT_DIR` is set.

---

## 4. Proposed Unified Structure

### Target: Everything under `~/.sero-ui/`

```
~/.sero-ui/
├── agent/                          # ← PI_CODING_AGENT_DIR target
│   ├── auth.json                   # Single source of truth for auth
│   ├── settings.json               # Merged: Pi SDK settings + Sero-specific
│   ├── .env                        # Sero tool API keys (TAVILY, etc.)
│   ├── models.json                 # Custom model definitions (if any)
│   ├── workspaces.json             # Workspace registry
│   ├── sessions/                   # Sero chat sessions
│   ├── extensions/                 # Extension configs (MCP, etc.)
│   ├── skills/                     # Skill files
│   ├── prompts/                    # Prompt templates
│   ├── themes/                     # Custom themes
│   ├── bin/                        # Managed binaries (fd, rg)
│   ├── packages/                   # Installed pi packages
│   └── npm-global/                 # npm-installed packages symlinks
├── workspaces/
│   ├── global/
│   │   ├── AGENTS.md               # Global agent context
│   │   ├── .sero-workspace.json
│   │   └── .sero/apps/*/state.json
└── (Electron userData stays at ~/Library/Application Support/sero/)
```

### 4.1 Migration Steps

#### Step 1: Set `PI_CODING_AGENT_DIR` in Sero's env loader

In `electron/env.ts`, set `PI_CODING_AGENT_DIR` before any SDK imports:

```ts
process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), '.sero-ui', 'agent');
```

This makes all SDK `getAgentDir()` calls resolve to `~/.sero-ui/agent/`.

#### Step 2: Update `shared-infra.ts`

Replace the hardcoded `PI_AGENT_DIR`:

```ts
// Before
export const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');

// After
export const SERO_AGENT_DIR = path.join(os.homedir(), '.sero-ui', 'agent');
```

Update `AuthStorage`, `SettingsManager`, `DefaultResourceLoader`, and
`createAgentSession` calls to use `SERO_AGENT_DIR`.

#### Step 3: Update `app-discovery.ts`

Replace `PI_AGENT_DIR` references with the unified directory.

#### Step 4: Merge `settings.json`

Migrate `~/.pi/agent/settings.json` content (packages, model prefs) into
`~/.sero-ui/agent/settings.json`. Add a Sero-specific section for
`hiddenCommands` etc.

#### Step 5: Migrate auth

Copy `~/.pi/agent/auth.json` → `~/.sero-ui/agent/auth.json` (one-time).
Delete the stale `~/.sero-ui/agent/auth.json` copy first.

#### Step 6: Migrate skills/prompts/extensions

Copy or symlink from `~/.pi/agent/skills/` to `~/.sero-ui/agent/skills/`
(and same for prompts, extensions). Or set up a one-time migration on first
Sero launch.

#### Step 7: Handle AGENTS.md hierarchy

With `agentDir` pointing to `~/.sero-ui/agent/`, placing a global
`AGENTS.md` at `~/.sero-ui/agent/AGENTS.md` would be the Pi SDK's standard
global context path. Sero could either:

- **Option A:** Continue using `~/.sero-ui/workspaces/global/AGENTS.md` via
  `agentsFilesOverride` (current approach, works fine)
- **Option B:** Move it to `~/.sero-ui/agent/AGENTS.md` to align with the
  SDK's standard hierarchy — then workspace-level AGENTS.md files are
  discovered via cwd walk-up as normal

Option B is cleaner but changes the user-facing location.

### 4.2 Pi CLI Independence

After this change, Pi CLI and Sero are **fully independent**:

| Tool | Agent Dir | Owns |
|------|-----------|------|
| Pi CLI | `~/.pi/agent/` (default) | Its own auth, settings, sessions, skills, packages |
| Sero | `~/.sero-ui/agent/` | Its own auth, settings, sessions, skills, packages |

**This is the correct separation.** They are different products with different:
- Session stores (already separate)
- Settings needs (Sero has workspaces, hidden commands, UI prefs)
- Auth refresh cycles (different OAuth flows)
- Package/extension lists

`~/.pi/agent/` continues to exist and be managed by the Pi CLI. Sero simply
stops reading from it. No symlinks, no shared files, no coordination needed.

If a user installs a skill or package via the Pi CLI, it only affects the Pi
CLI. If they want the same skill in Sero, they install it separately within
Sero. This eliminates the current confusion where editing
`~/.pi/agent/settings.json` (a Pi CLI file) is required to register Sero apps.

### 4.3 Bootstrapping (No Migration Needed)

Since Sero is becoming self-contained, there's no need to migrate files from
`~/.pi/agent/`. Instead, Sero bootstraps its own agent directory on first run:

1. **Auth** — Sero already has its own OAuth flow. On first launch with no
   `auth.json`, the user authenticates through Sero's UI. Clean slate.
2. **Settings** — Sero creates `~/.sero-ui/agent/settings.json` with its own
   defaults (model, thinking level, packages list referencing Sero apps).
3. **Skills/prompts/extensions** — Sero ships its own built-in set. Users can
   install additional ones via Sero's package management (when that exists).
4. **`bin/`** — The Pi SDK auto-downloads `fd` on first use if it's missing
   from the agent dir.

The only one-time cleanup is deleting the stale `~/.sero-ui/agent/auth.json`
that was copied earlier, so it doesn't conflict with a freshly authed token.

---

## 5. Impact on Sero App Development

### Installing Sero Apps

Currently: add package path to `~/.pi/agent/settings.json` `packages` array.

After unification: add to `~/.sero-ui/agent/settings.json` `packages` array.
The `apps-tutorial.md` needs updating.

### App State Location

No change needed. App state already lives correctly under workspace dirs:
`~/.sero-ui/workspaces/<id>/.sero/apps/<app>/state.json`

### External Workspace App State

For workspaces that point to external folders (e.g.
`~/Documents/Dev/projects/sero/workspaces/workspace1`), app state goes to
`<workspace-path>/.sero/apps/*/state.json`. This is fine and intentional —
project-specific state lives with the project.

---

## 6. Summary of Files Across All Locations

### Files Sero Must Own (in `~/.sero-ui/agent/`)

| File | Status | Notes |
|------|--------|-------|
| `auth.json` | Bootstrap fresh | Sero's own OAuth tokens, independent from Pi CLI |
| `settings.json` | Create on first run | Sero defaults + packages list for Sero apps |
| `skills/` | Empty initially | Users install via Sero; no dependency on `~/.pi/agent/skills/` |
| `prompts/` | Empty initially | Same |
| `extensions/` | Empty initially | Same |
| `bin/` | Auto-provisioned | SDK downloads `fd` on first use |

### Files That Stay Where They Are

| File | Location | Reason |
|------|----------|--------|
| `agent/.env` | `~/.sero-ui/` | Already correct |
| `agent/sessions/` | `~/.sero-ui/` | Already correct |
| `agent/workspaces.json` | `~/.sero-ui/` | Already correct |
| `workspaces/*/` | `~/.sero-ui/` | Already correct |
| Electron data | `~/Library/Application Support/sero/` | macOS standard, not app state |
| npm packages | `~/.volta/.../node_modules/` | Infrastructure, not config |

### Files to Clean Up

| File | Location | Reason |
|------|----------|--------|
| `auth.json` (stale) | `~/.sero-ui/agent/` | Orphaned copy from earlier code; delete so fresh auth can take its place |

---

## 7. Code Changes Required

### `electron/env.ts`
Set `PI_CODING_AGENT_DIR` env var before SDK loads.

### `electron/ipc/shared-infra.ts`
Replace `PI_AGENT_DIR` constant with `SERO_AGENT_DIR` pointing to
`~/.sero-ui/agent/`. Remove dual-path logic.

### `electron/app-discovery.ts`
Update `PI_AGENT_DIR` / `PI_EXTENSIONS_DIR` constants.

### `electron/ipc/agent.ts`
Update all `PI_AGENT_DIR` references.

### `electron/ipc/app-agent.ts`
Update `agentDir` reference.

### `electron/main.ts`
Remove hardcoded `registerAppPath()` calls that reference monorepo-relative
paths — these should come from `settings.json` packages list instead.

### `AGENTS.md` (project root)
Update documentation about where settings and apps are registered.

### `docs/apps-tutorial.md`
Update the "register in settings.json" step to point to the new location.
