# Sero Storage & State Location Analysis

> **Date:** 2026-02-15
> **Goal:** Map every folder contributing to Sero, identify overlaps and unclear
> ownership, and propose a unified layout under `~/.sero-ui`.

---

## 1. Current Folder Inventory

### A. `~/.pi/agent/` — Pi SDK Config Directory

**Created by:** Pi SDK automatically on first run (`pi` CLI).
**Controlled by:** `PI_CODING_AGENT_DIR` env var (defaults to `~/.pi/agent`).

| Path | Purpose | Used by Sero? |
|------|---------|---------------|
| `auth.json` | OAuth tokens (Anthropic, OpenAI, Google, OpenRouter) | **YES** — `shared-infra.ts` reads `~/.pi/agent/auth.json` directly |
| `settings.json` | Pi settings: default model, thinking level, installed packages list | **YES** — `app-discovery.ts` reads packages list; `shared-infra.ts` reads settings |
| `extensions/` | Pi extension JSON configs (e.g. `firecrawl-mcp.json`) | **YES** — `app-discovery.ts` scans for `sero.app` manifests |
| `sessions/` | Pi CLI session history (JSONL files keyed by cwd) | **NO** — Sero has its own session dir |
| `skills/` | Pi skill packages (SKILL.md files) | **Indirectly** — loaded by Pi SDK when running `pi` CLI in terminal |
| `prompts/` | Prompt templates (`.md` files) | **Indirectly** — loaded by Pi SDK |
| `bin/` | Managed binaries (`fd`) | **NO** |
| `git/` | Git-installed pi packages | **NO** (empty) |
| `npm-global/` | npm-installed pi packages | **NO** (empty — packages install via pnpm/volta instead) |

**Key files with overlap:**
- `auth.json` — **DUPLICATED** in `~/.sero-ui/agent/auth.json` (different tokens!)
- `settings.json` — **PARTIALLY DUPLICATED** — Pi's has packages list, Sero references a separate `~/.sero-ui/agent/settings.json` (currently doesn't exist)

---

### B. `~/.sero-ui/` — Sero Application Data

**Created by:** Sero desktop app (`electron/workspace.ts`).
**Controlled by:** Hardcoded `SERO_HOME = path.join(os.homedir(), '.sero-ui')`.

| Path | Purpose | Notes |
|------|---------|-------|
| `agent/auth.json` | OAuth tokens for Sero's agent sessions | **OVERLAP** with `~/.pi/agent/auth.json` — separate login needed |
| `agent/.env` | API keys (TAVILY, FIRECRAWL) | Sero-only; loaded by `electron/env.ts` |
| `agent/sessions/` | Sero chat session JSONL files | Sero-only; separate from Pi CLI sessions |
| `agent/workspaces.json` | Workspace registry (id, path, open state) | Sero-only |
| `agent/settings.json` | Sero-specific settings (hidden commands, etc.) | **DOES NOT EXIST YET** — referenced in code but never created |
| `workspaces/global/` | Default "Global" workspace | Contains `AGENTS.md`, `.sero-workspace.json`, app state |
| `workspaces/global/.sero/apps/*/state.json` | App state files (todo, daily-quote) | Sero apps store their state here |
| `workspaces/global/memories.md` | User memories / knowledge base | Sero-only |

---

### C. `~/Library/Application Support/sero/` — Electron App Data

**Created by:** Electron automatically (Chromium profile data).
**Controlled by:** `app.getPath('userData')` in Electron.

| Path | Purpose | Notes |
|------|---------|-------|
| `Cache/`, `GPUCache/`, `DawnGraphiteCache/` | Chromium rendering caches | Electron internal — not our concern |
| `Session Storage/` | Chromium session storage (LevelDB) | Electron internal |
| `blob_storage/` | Chromium blob storage | Electron internal |
| `Preferences` | Chromium preferences | Electron internal |
| `sero-data/settings.json` | Sero UI settings (env vars like TAVILY_API_KEY) | **OVERLAP** — env vars also stored in `~/.sero-ui/agent/.env` |
| `sero-data/projects.json` | Container-based project definitions (id, name, image, cpus, ports) | Legacy? Seems to be from an earlier architecture |
| `sero-data/projects/*/chat.json` | Per-project chat history | **OVERLAP** — sessions are also in `~/.sero-ui/agent/sessions/` |
| `sero-data/projects/*/editor.json` | Editor state (open tabs) | Lightweight UI state |
| `sero-data/projects/*/layout.json` | Panel layout (grid positions, sizes, active views) | UI layout state |
| `sero-data/usage/` | Per-project and global token usage tracking | Cost tracking data |
| `sero-data/resources.json` | Registered packages, skills, prompts (currently empty) | **OVERLAP** — Pi uses `settings.json` packages array |
| `sero-data/packages/` | Package install directory (git/, npm/ — both empty) | **OVERLAP** — Pi uses `~/.pi/agent/git/` and npm-global |

---

### D. `~/.volta/` — Volta Tool Manager

**Created by:** Volta (Node.js version manager).
**Used by Pi for:** Global npm package installs.

| Path | Purpose | Notes |
|------|---------|-------|
| `tools/image/node/*/lib/node_modules/` | Globally installed npm packages | Contains pi packages: `pi-mcp-adapter`, `pi-planning-with-files`, `pi-subagents`, `@benvargas/pi-firecrawl-mcp` |

**Note:** The user also has `pnpm` installing `pi` itself at `~/Library/pnpm/`. Volta is used for global Node but pnpm manages the `pi` binary. This is a package manager concern, not a Sero concern — Pi packages get installed here via `npm install -g` when using Volta's node.

---

## 2. Overlap & Confusion Matrix

| Concern | Location 1 | Location 2 | Location 3 | Issue |
|---------|-----------|-----------|-----------|-------|
| **Auth tokens** | `~/.pi/agent/auth.json` | `~/.sero-ui/agent/auth.json` | — | Two separate logins required; tokens diverge |
| **API keys** | `~/.sero-ui/agent/.env` | `sero-data/settings.json` (env field) | — | Same TAVILY key stored in two places |
| **Agent settings** | `~/.pi/agent/settings.json` | `~/.sero-ui/agent/settings.json` (missing) | `sero-data/settings.json` | Three potential locations, unclear which wins |
| **Installed packages** | `~/.pi/agent/settings.json` (packages array) | `sero-data/resources.json` | — | Pi settings is the source of truth; resources.json is empty/unused |
| **Chat history** | `~/.sero-ui/agent/sessions/` | `sero-data/projects/*/chat.json` | `~/.pi/agent/sessions/` | Three possible session stores |
| **Session storage** | `~/.sero-ui/agent/sessions/` (JSONL) | `sero-data/projects/*/chat.json` (JSON array) | — | Two formats for the same data |
| **Package installs** | `~/.volta/tools/image/.../node_modules/` | `sero-data/packages/` (empty) | `~/.pi/agent/npm-global/` (empty) | Three potential locations |
| **UI layout** | `sero-data/projects/*/layout.json` | — | — | Only one location (good) |
| **App state** | `~/.sero-ui/workspaces/*/.sero/apps/*/state.json` | — | — | Only one location (good) |
| **Workspace registry** | `~/.sero-ui/agent/workspaces.json` | — | — | Only one location (good) |

---

## 3. How Pi SDK Creates `~/.pi/agent/`

The Pi SDK uses a `getAgentDir()` function (in `config.ts`) that:

1. Checks `PI_CODING_AGENT_DIR` env var first
2. Falls back to `~/.pi/agent/` (derived from `CONFIG_DIR_NAME` in `package.json` piConfig)

**This is the key lever.** Setting `PI_CODING_AGENT_DIR=~/.sero-ui/agent` before
creating any `AgentSession` would redirect **all** Pi SDK file operations to
Sero's directory. This includes:
- `auth.json` (auth storage)
- `settings.json` (Pi settings)
- `sessions/` (session storage — though Sero already overrides this)
- `extensions/`, `skills/`, `prompts/` (resource discovery)
- `bin/` (managed binaries)
- `models.json` (custom model registry)

The `SettingsManager.create()` also accepts an `agentDir` parameter, and
`createAgentSession()` accepts `agentDir` to override the default.

---

## 4. Current Code Path Analysis

### How Sero creates agent sessions (`shared-infra.ts`):

```typescript
// Auth is loaded from PI_AGENT_DIR (~/.pi/agent/auth.json)
_authStorage = new AuthStorage(path.join(PI_AGENT_DIR, 'auth.json'));

// Settings manager gets TWO dirs: sero-ui for sero config, pi for pi config
_settingsManager = SettingsManager.create(
  path.join(os.homedir(), '.sero-ui'),
  PI_AGENT_DIR,  // ~/.pi/agent
);
```

### How Sero creates sessions (`agent.ts`):

```typescript
const { session } = await createAgentSession({
  cwd: wsPath,
  agentDir: PI_AGENT_DIR,         // ~/.pi/agent — for resource discovery
  sessionManager: SessionManager.file(SERO_SESSION_DIR, wsPath),  // ~/.sero-ui/agent/sessions/
  // ...
});
```

### How apps are discovered (`app-discovery.ts`):

```typescript
const PI_AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');
const PI_EXTENSIONS_DIR = path.join(PI_AGENT_DIR, 'extensions');
// Scans: ~/.pi/agent/extensions/ + packages from ~/.pi/agent/settings.json
```

---

## 5. The `~/Library/Application Support/sero/` Situation

This directory is **two things mixed together**:

1. **Electron internal data** (Cache, GPUCache, Session Storage, Preferences) — managed by Chromium, cannot be moved, shouldn't be touched.
2. **`sero-data/`** — our app data (projects, usage, settings, layout). This was designed for a container-based architecture (`projects.json` has `image`, `cpus`, `memoryMB` fields) that appears to be transitioning to the workspace model in `~/.sero-ui/`.

**The `sero-data/` subfolder appears to be legacy** from before the workspace system was built. The workspace model (`~/.sero-ui/workspaces/`) now handles what `sero-data/projects/` used to do.

---

## 6. Proposed Unified Layout

**Target:** Everything Sero-specific lives in `~/.sero-ui/`. The Pi CLI (`pi` command) can keep its own `~/.pi/agent/` for terminal usage — they don't need to share.

### What to consolidate into `~/.sero-ui/`:

```
~/.sero-ui/
├── agent/
│   ├── auth.json              ← Single auth source (already exists)
│   ├── .env                   ← API keys (already exists)
│   ├── settings.json          ← Merged Pi + Sero settings (model, thinking, packages)
│   ├── sessions/              ← Chat session JSONL files (already exists)
│   ├── extensions/            ← Sero-specific extensions / app manifests
│   ├── skills/                ← Skills (if Sero needs its own)
│   ├── prompts/               ← Prompt templates
│   ├── bin/                   ← Managed binaries (fd, rg)
│   ├── models.json            ← Custom model definitions
│   └── workspaces.json        ← Workspace registry (already exists)
├── workspaces/
│   ├── global/                ← Default workspace (already exists)
│   │   ├── AGENTS.md
│   │   ├── .sero-workspace.json
│   │   ├── .sero/apps/*/state.json
│   │   └── memories.md
└── ui/
    ├── layout/                ← Per-workspace UI layout (moved from sero-data)
    └── usage/                 ← Token usage tracking (moved from sero-data)
```

### Implementation steps:

1. **Set `PI_CODING_AGENT_DIR`** to `~/.sero-ui/agent` in the Electron main process (before any Pi SDK calls). This redirects all SDK file operations.

2. **Migrate auth** — Copy `~/.pi/agent/auth.json` into `~/.sero-ui/agent/auth.json` (or unify on one). Update `shared-infra.ts` to use `~/.sero-ui/agent/auth.json` as the sole source.

3. **Merge settings** — Create `~/.sero-ui/agent/settings.json` with the packages list from `~/.pi/agent/settings.json` plus any Sero-specific settings.

4. **Move app discovery** to scan `~/.sero-ui/agent/extensions/` instead of `~/.pi/agent/extensions/`.

5. **Move `sero-data/` contents** from `~/Library/Application Support/sero/sero-data/` into `~/.sero-ui/`:
   - `usage/` → `~/.sero-ui/ui/usage/`
   - `projects/*/layout.json` → `~/.sero-ui/ui/layout/`
   - `projects.json` → deprecate (workspace model replaces it)
   - `settings.json` → merge env vars into `~/.sero-ui/agent/.env`
   - `resources.json` → deprecate (use `settings.json` packages array)

6. **Leave `~/Library/Application Support/sero/`** for Electron internals only (caches, Chromium data).

7. **Pi CLI stays independent** — `~/.pi/agent/` continues to work for `pi` CLI terminal usage. No conflict. Users who want shared auth can symlink.

### Key env var to set (in `electron/main.ts` or `electron/env.ts`):

```typescript
process.env.PI_CODING_AGENT_DIR = path.join(os.homedir(), '.sero-ui', 'agent');
```

This single line eliminates the need for `PI_AGENT_DIR` constant in `shared-infra.ts` and makes the Pi SDK naturally use Sero's directory for everything.

---

## 7. Files That Need Changing

| File | Change |
|------|--------|
| `electron/env.ts` | Set `PI_CODING_AGENT_DIR` early |
| `electron/ipc/shared-infra.ts` | Remove `PI_AGENT_DIR` constant; rely on SDK's `getAgentDir()` |
| `electron/ipc/agent.ts` | Remove `PI_AGENT_DIR` import; SDK auto-resolves |
| `electron/ipc/app-agent.ts` | Remove `PI_AGENT_DIR` import |
| `electron/app-discovery.ts` | Change `PI_EXTENSIONS_DIR` to use `~/.sero-ui/agent/extensions/` |
| `electron/workspace.ts` | Already correct (`SERO_HOME = ~/.sero-ui`) |
| Migration script (new) | One-time copy of auth, settings, extensions from `~/.pi/agent/` → `~/.sero-ui/agent/` |

---

## 8. Volta / pnpm Clarification

- **Volta** (`~/.volta/`) is a Node.js version manager. It's not Sero-specific.
- **pnpm** (`~/Library/pnpm/`) manages the `pi` CLI binary install.
- Pi packages installed via `pi install npm:...` end up in Volta's global `node_modules` because Volta intercepts `npm install -g`.
- **For Sero**, packages should be referenced by path in `settings.json` (as the sero extensions already are: `../../Documents/Dev/projects/sero/sero/packages/pi-todo-extension`). No Volta involvement needed.
- If Sero wants to manage its own packages, it should use `~/.sero-ui/agent/packages/` with its own install mechanism rather than piggybacking on global npm.
