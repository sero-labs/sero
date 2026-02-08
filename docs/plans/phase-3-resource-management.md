# Phase 3: Resource Management

> **Status:** Spec complete, ready for implementation  
> **Created:** 2026-02-08  
> **Replaces:** Skills panel (`SkillsPanel.tsx`, `skill-manager.ts`, `skill-store.ts`)

## 1. Overview

### Problem

Sero currently manages only Pi skills via a dedicated Skills panel. Pi's SDK supports a broader ecosystem of **packages** (bundles of extensions, skills, prompts, themes), **extensions** (runtime TypeScript modules that register tools/events/commands), **prompt templates**, and **themes**. Sero has no way to install, browse, or enable these resource types.

### Solution

Replace the Skills panel with a unified **Resources** system that manages all five Pi resource types: Packages, Extensions, Skills, Prompts, and Themes. Each type gets its own dockview panel with Browse/Install/Create sub-views. A new `ResourceManager` in the main process handles discovery, installation, persistence, and runtime loading. The agent tool layer is refactored to use Pi SDK tool factories with container operations.

### Success Criteria

- Users can install Pi packages from npm, git, and local paths via the UI
- Installed extensions actually run: their tools appear in the agent, event hooks fire
- All five resource types are browsable with per-project enable/disable
- Existing skills functionality is preserved (zero regression)
- SDK tool factories replace custom tool implementations (bash, read, write, edit, ls + new grep, find)
- "Restart Agent" indicator appears when resource config changes

### Stakeholders

- **End users** — manage packages/extensions/skills/prompts/themes via GUI
- **Pi SDK** — Sero consumes its `DefaultResourceLoader`, tool factories, and type exports
- **Existing skills users** — seamless migration, no data loss

---

## 2. Architecture

### 2.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DISK (Resource Sources)                        │
│                                                                         │
│  ~/Library/Application Support/sero/sero-data/                          │
│    ├── resources.json              ← installed packages + extensions     │
│    └── projects/<id>/resources.json ← per-project enable/disable        │
│                                                                         │
│  ~/Library/Application Support/sero/sero-data/packages/                 │
│    ├── npm/                        ← npm package installs               │
│    └── git/                        ← git repo clones                    │
│                                                                         │
│  ~/.pi/agent/                                                           │
│    ├── skills/                     ← standalone global skills           │
│    ├── extensions/                 ← standalone global extensions        │
│    ├── prompts/                    ← standalone global prompts           │
│    └── themes/                     ← standalone global themes            │
│                                                                         │
│  <workspace>/.pi/                  ← project-local resources             │
│    ├── skills/                                                           │
│    ├── extensions/                                                       │
│    └── prompts/                                                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                           DISCOVERY
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  ResourceManager (Electron main process)                 │
│                  electron/resource-manager.ts                            │
│                                                                         │
│  Responsibilities:                                                      │
│    • Discover all resource types from all sources                       │
│    • Install/uninstall packages (npm, git, local)                       │
│    • Per-project enable/disable config                                  │
│    • Provide resources to DefaultResourceLoader for agent sessions      │
│    • Expose browseable metadata to renderer via IPC                     │
│                                                                         │
│  Sub-modules:                                                           │
│    • resource-installer.ts  — npm/git/local install logic               │
│    • resource-discovery.ts  — scan dirs, parse manifests                │
│    • resource-config.ts     — persistence for install list + overrides  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
         IPC BRIDGE     RESOURCE LOADER      TOOL LAYER
              │                 │                  │
              ▼                 ▼                  ▼
┌──────────────────┐  ┌────────────────────┐  ┌──────────────────────────┐
│  Renderer (React) │  │ DefaultResource-   │  │ SDK Tool Factories       │
│                    │  │ Loader             │  │                          │
│  Resource Panels   │  │                    │  │ createBashTool(cwd, {    │
│  ├ PackagesPanel   │  │ Discovers:         │  │   operations: container  │
│  ├ ExtensionsPanel │  │  • extensions      │  │ })                       │
│  ├ SkillsPanel     │  │  • skills          │  │ createReadTool(cwd, {    │
│  ├ PromptsPanel    │  │  • prompts         │  │   operations: container  │
│  └ ThemesPanel     │  │  • themes          │  │ })                       │
│                    │  │  • packages        │  │ + createGrepTool         │
│  resource-store.ts │  │                    │  │ + createFindTool         │
│  (Zustand)         │  │ Feeds into         │  │ + read_terminal (custom) │
│                    │  │ createAgentSession │  │ + read_skill (custom)    │
└──────────────────┘  └────────────────────┘  └──────────────────────────┘
```

### 2.2 Agent Session Integration

```typescript
// electron/agent-manager.ts (revised)
const loader = new DefaultResourceLoader({
  cwd: WORKSPACE_DIR,
  settingsManager,
  systemPromptOverride: () => buildSystemPrompt(resourceManager, projectId),
  // Extensions discovered by ResourceManager fed via:
  additionalExtensionPaths: resourceManager.getEnabledExtensionPaths(projectId),
  // Skills discovered by ResourceManager fed via:
  skillsOverride: (current) => ({
    skills: resourceManager.getEnabledSkills(projectId),
    diagnostics: current.diagnostics,
  }),
  // Prompts fed via:
  promptsOverride: (current) => ({
    prompts: [...current.prompts, ...resourceManager.getEnabledPrompts(projectId)],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: WORKSPACE_DIR,
  sessionManager: SessionManager.inMemory(),
  authStorage: this.authStorage,
  modelRegistry: this.modelRegistry,
  // SDK tool factories with container operations (replaces custom tools)
  tools: createContainerSdkTools(containerManager, projectId),
  // Custom tools that have no SDK equivalent
  customTools: [createReadTerminal(cm, projectId), createReadSkill(resourceManager)],
  resourceLoader: loader,
  settingsManager,
});
```

### 2.3 Tool Layer Refactor

Replace `agent-tools.ts` custom implementations with SDK tool factories + container operations:

```typescript
// electron/agent-tools.ts (revised)
import {
  createBashTool, createReadTool, createWriteTool,
  createEditTool, createLsTool, createGrepTool, createFindTool,
  type BashOperations, type ReadOperations, type WriteOperations,
  type EditOperations, type LsOperations, type GrepOperations, type FindOperations,
} from '@mariozechner/pi-coding-agent';

function createContainerBashOps(cm: ContainerManager, projectId: string): BashOperations {
  return {
    spawn: async ({ command, cwd }) => {
      const result = await cm.exec(projectId, command, cwd ?? WORKSPACE_DIR);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    },
  };
}

function createContainerReadOps(cm: ContainerManager, projectId: string): ReadOperations {
  return {
    readFile: async (filePath) => {
      return cm.readFile(projectId, filePath);
    },
    access: async (filePath) => {
      const result = await cm.exec(projectId, `test -r '${filePath}'`);
      if (result.exitCode !== 0) throw new Error(`Cannot access ${filePath}`);
    },
  };
}

// ... similar for Write, Edit, Ls, Grep, Find operations

export function createContainerSdkTools(cm: ContainerManager, projectId: string) {
  return [
    createBashTool(WORKSPACE_DIR, { operations: createContainerBashOps(cm, projectId) }),
    createReadTool(WORKSPACE_DIR, { operations: createContainerReadOps(cm, projectId) }),
    createWriteTool(WORKSPACE_DIR, { operations: createContainerWriteOps(cm, projectId) }),
    createEditTool(WORKSPACE_DIR, { operations: createContainerEditOps(cm, projectId) }),
    createLsTool(WORKSPACE_DIR, { operations: createContainerLsOps(cm, projectId) }),
    createGrepTool(WORKSPACE_DIR, { operations: createContainerGrepOps(cm, projectId) }),
    createFindTool(WORKSPACE_DIR, { operations: createContainerFindOps(cm, projectId) }),
  ];
}
```

> **Note — Alternative for skill file access:** Instead of `read_skill`, we could bind-mount
> `~/.pi/agent/skills/` into the container at `/skills/` so the standard `read` tool can access
> them. This eliminates the custom `read_skill` tool entirely. Deferred for now since `read_skill`
> is proven, but worth revisiting if the host/container boundary causes friction elsewhere.

### 2.4 Persistence

#### Global Resource Config

**Path:** `~/Library/Application Support/sero/sero-data/resources.json`

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1",
    "/absolute/path/to/local-package"
  ],
  "extensions": [
    "/path/to/standalone-extension.ts"
  ],
  "skills": [],
  "prompts": [],
  "themes": []
}
```

#### Per-Project Resource Config

**Path:** `~/Library/Application Support/sero/sero-data/projects/<id>/resources.json`

```json
{
  "enabled": {
    "packages": ["npm:@foo/bar@1.0.0"],
    "extensions": ["my-extension"],
    "skills": ["browser-tools", "search"],
    "prompts": ["deploy"],
    "themes": ["dark"]
  },
  "disabled": {
    "packages": [],
    "extensions": ["noisy-extension"],
    "skills": ["transcribe"],
    "prompts": [],
    "themes": []
  }
}
```

Semantics match existing skills pattern: resources are **enabled by default**; the config only records explicit overrides.

#### Package Installation Directories

| Source | Install Location |
|--------|-----------------|
| npm | `~/Library/Application Support/sero/sero-data/packages/npm/<package-name>/` |
| git | `~/Library/Application Support/sero/sero-data/packages/git/<host>/<owner-repo>/` |
| local | Referenced in-place (path stored in config, not copied) |

---

## 3. ResourceManager API

```typescript
// electron/resource-manager.ts

interface SeroResource {
  name: string;
  description: string;
  type: 'package' | 'extension' | 'skill' | 'prompt' | 'theme';
  /** Where this resource came from */
  source: 'npm' | 'git' | 'local' | 'global' | 'project';
  /** For resources inside a package, the parent package source */
  packageSource?: string;
  /** Filesystem path to the resource */
  path: string;
  /** Whether enabled for a given project (set by listAll) */
  enabled: boolean;
}

interface PackageInfo {
  source: string;              // e.g. "npm:@foo/bar@1.0.0"
  name: string;                // e.g. "@foo/bar"
  installPath: string;         // where it's installed on disk
  manifest?: PiPackageManifest;
  resources: {
    extensions: string[];      // paths relative to package root
    skills: string[];
    prompts: string[];
    themes: string[];
  };
}

class ResourceManager {
  // ── Discovery ──────────────────────────────────
  async discoverAll(): Promise<void>;
  discoverProjectResources(projectId: string, workspaceDir: string): void;

  // ── Listing (with per-project enable/disable applied) ──
  listPackages(projectId?: string): PackageInfo[];
  listExtensions(projectId?: string): SeroResource[];
  listSkills(projectId?: string): SeroResource[];
  listPrompts(projectId?: string): SeroResource[];
  listThemes(projectId?: string): SeroResource[];
  listAll(projectId?: string): SeroResource[];

  // ── Installation ───────────────────────────────
  async installPackage(source: string): Promise<InstallResult>;
  async uninstallPackage(source: string): Promise<UninstallResult>;
  async installExtension(source: string): Promise<InstallResult>;
  async uninstallExtension(name: string): Promise<UninstallResult>;
  // Skills, prompts, themes have similar install/uninstall

  // ── Preview Install (for git/npm with multiple resources) ──
  async previewInstall(source: string): Promise<PreviewResult>;
  async installSelected(previewId: string, selected: string[]): Promise<SelectiveInstallResult>;
  cleanupPreview(previewId: string): void;

  // ── Per-Project Config ─────────────────────────
  enableResource(projectId: string, type: string, name: string): void;
  disableResource(projectId: string, type: string, name: string): void;
  toggleResource(projectId: string, type: string, name: string): boolean;
  isResourceEnabled(projectId: string, type: string, name: string): boolean;

  // ── For AgentManager Integration ───────────────
  getEnabledExtensionPaths(projectId: string): string[];
  getEnabledSkills(projectId: string): Skill[];
  getEnabledPrompts(projectId: string): PromptTemplate[];
  getEnabledThemes(projectId: string): Theme[];
  formatSkillsForSystemPrompt(projectId: string): string;

  // ── Skill-specific (preserves read_skill support) ──
  readSkillContent(name: string): string | null;

  // ── Create from template ───────────────────────
  async createSkill(name: string, description: string): Promise<CreateResult>;
  async createExtension(name: string, description: string): Promise<CreateResult>;
  async createPrompt(name: string, content: string): Promise<CreateResult>;

  // ── Config change tracking ─────────────────────
  hasUnappliedChanges(projectId: string): boolean;
  clearChangeFlag(projectId: string): void;
}
```

---

## 4. IPC Channels

### New Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `resources:listPackages` | renderer → main | List installed packages with enable state |
| `resources:listExtensions` | renderer → main | List all extensions (standalone + from packages) |
| `resources:listSkills` | renderer → main | List all skills |
| `resources:listPrompts` | renderer → main | List all prompt templates |
| `resources:listThemes` | renderer → main | List all themes |
| `resources:install` | renderer → main | Install a package/resource from source |
| `resources:uninstall` | renderer → main | Uninstall a package/resource |
| `resources:previewInstall` | renderer → main | Preview a source before installing |
| `resources:installSelected` | renderer → main | Install selected resources from preview |
| `resources:cleanupPreview` | renderer → main | Clean up preview temp dir |
| `resources:toggle` | renderer → main | Toggle enable/disable, returns new state |
| `resources:enable` | renderer → main | Enable a resource for a project |
| `resources:disable` | renderer → main | Disable a resource for a project |
| `resources:readContent` | renderer → main | Read raw content of a skill/prompt/theme |
| `resources:listFiles` | renderer → main | List files in a resource's directory |
| `resources:create` | renderer → main | Create a new skill/extension/prompt from template |
| `resources:discover` | renderer → main | Re-scan all resource locations |
| `resources:hasChanges` | renderer → main | Check if agent restart needed |

### Removed Channels

All `skills:*` channels are removed and replaced by `resources:*` equivalents.

---

## 5. Renderer (React)

### 5.1 Zustand Store

**File:** `src/stores/resource-store.ts`

Replaces `skill-store.ts`. Single store with state for all resource types.

```typescript
interface ResourceStore {
  // Per-type resource lists
  packages: PackageInfo[];
  extensions: ResourceInfo[];
  skills: ResourceInfo[];
  prompts: ResourceInfo[];
  themes: ResourceInfo[];

  // UI state
  isLoading: boolean;
  searchQuery: string;
  contentCache: Map<string, string>;
  filesCache: Map<string, string[]>;

  // Restart indicator
  hasUnappliedChanges: boolean;

  // Actions
  setResources: (type: ResourceType, items: ResourceInfo[]) => void;
  setPackages: (packages: PackageInfo[]) => void;
  updateEnabled: (type: ResourceType, name: string, enabled: boolean) => void;
  removeResource: (type: ResourceType, name: string) => void;
  // ... search, cache, loading actions
}
```

### 5.2 Dockview Panels

Five new panel types registered in `TiledWorkspace.tsx`:

| Panel Type | Component | Description |
|------------|-----------|-------------|
| `packages` | `PackagesPanel` | Browse/install/remove Pi packages |
| `extensions` | `ExtensionsPanel` | Browse/enable/disable extensions |
| `skills` | `SkillsPanel` (new) | Browse/enable/disable/create skills |
| `prompts` | `PromptsPanel` | Browse/enable/disable/create prompt templates |
| `themes` | `ThemesPanel` | Browse/enable/disable themes |

### 5.3 Shared Components

Reusable components across all resource panels (extracted to `src/components/panels/resources/`):

| Component | Purpose |
|-----------|---------|
| `ResourceBrowseView` | Search bar + card grid with enable/disable toggle, shared across types |
| `ResourceDetailView` | Back button, metadata, content preview, file list, actions |
| `ResourceInstallView` | Source input (npm/git/local), scope selector, preview + selective install |
| `ResourceCreateView` | Name/description form, template scaffolding |
| `ResourceCard` | Single resource card with toggle, scope badge, delete button |
| `ResourceToggle` | Enable/disable switch (reuse existing toggle CSS) |
| `RestartIndicator` | "Restart agent to apply changes" banner |

Each panel composes these shared components with type-specific props:

```tsx
// src/components/panels/SkillsPanel.tsx (new)
export function SkillsPanel({ projectId, panelId }: Props) {
  return (
    <ResourcePanelLayout
      resourceType="skill"
      projectId={projectId}
      panelId={panelId}
      canCreate={true}
      createFields={['name', 'description']}
    />
  );
}
```

### 5.4 CSS

**File:** `src/components/panels/Resources.css`

Replaces `SkillsPanel.css`. Reuses the same design system (CSS variables, card layout, toggle switch, etc.) with class names generalized from `skills-*` to `resource-*`.

---

## 6. Preload API

**File:** `electron/preload.ts`

New `window.sero.resources` namespace replaces `window.sero.skills`:

```typescript
resources: {
  listPackages: (projectId?: string) => Promise<PackageInfo[]>,
  listExtensions: (projectId?: string) => Promise<ResourceInfo[]>,
  listSkills: (projectId?: string) => Promise<ResourceInfo[]>,
  listPrompts: (projectId?: string) => Promise<ResourceInfo[]>,
  listThemes: (projectId?: string) => Promise<ResourceInfo[]>,
  install: (source: string, type?: ResourceType) => Promise<InstallResult>,
  uninstall: (type: ResourceType, name: string) => Promise<UninstallResult>,
  previewInstall: (source: string) => Promise<PreviewResult>,
  installSelected: (previewId: string, selected: string[]) => Promise<SelectiveInstallResult>,
  cleanupPreview: (previewId: string) => Promise<void>,
  toggle: (projectId: string, type: ResourceType, name: string) => Promise<boolean>,
  enable: (projectId: string, type: ResourceType, name: string) => Promise<void>,
  disable: (projectId: string, type: ResourceType, name: string) => Promise<void>,
  readContent: (type: ResourceType, name: string) => Promise<string | null>,
  listFiles: (type: ResourceType, name: string) => Promise<string[]>,
  create: (type: ResourceType, name: string, opts: CreateOpts) => Promise<CreateResult>,
  discover: () => Promise<void>,
  hasChanges: (projectId: string) => Promise<boolean>,
}
```

---

## 7. Error Handling

### Extension Loading Errors

When an extension fails to load (syntax error, missing dependency, runtime crash):

1. The extension is **skipped** — other extensions still load normally
2. The error is recorded in `ResourceManager` with details (path, error message, stack)
3. The **Extensions panel** shows a red error badge on the broken extension's card
4. The card expands to show the full error message
5. The agent session creates successfully with remaining healthy extensions

### Installation Errors

- **npm install fails:** Show error in Install view with npm's error output
- **git clone fails:** Show error with git's output (auth issues, network, etc.)
- **Invalid package (no pi manifest or convention dirs):** "No Pi resources found in this package"
- **Name collision:** "A resource with this name already exists"

---

## 8. Implementation Phases

### Phase 3.1 — Foundation (ResourceManager + Persistence)

**Files to create:**
- `electron/resource-manager.ts` — Core manager class
- `electron/resource-installer.ts` — npm/git/local install logic
- `electron/resource-discovery.ts` — Scan directories, parse pi manifests
- `electron/resource-config.ts` — Read/write resources.json + per-project overrides

**Files to modify:**
- `electron/main.ts` — Instantiate ResourceManager, pass to IPC handlers
- `electron/ipc-handlers.ts` — Add `resources:*` handlers, remove `skills:*` handlers

**Acceptance:**
- ResourceManager discovers skills from `~/.pi/agent/skills/` (backward compat)
- ResourceManager discovers extensions from `~/.pi/agent/extensions/`
- Install/uninstall npm and git packages
- Per-project enable/disable persists to `resources.json`

### Phase 3.2 — Tool Refactor

**Files to create/modify:**
- `electron/agent-tools.ts` — Replace custom tools with SDK factory + container operations
- `electron/container-operations.ts` — Implement `BashOperations`, `ReadOperations`, etc.

**Acceptance:**
- All 7 SDK tools (bash, read, write, edit, ls, grep, find) work via container operations
- `read_terminal` and `read_skill` remain as custom tools
- Agent behavior is functionally identical to before (no regression)
- Output truncation and rendering match Pi SDK behavior

### Phase 3.3 — Agent Session Integration

**Files to modify:**
- `electron/agent-manager.ts` — Use DefaultResourceLoader with ResourceManager data, load extensions at runtime
- `electron/agent-system-prompt.ts` — Update to use ResourceManager for skills

**Acceptance:**
- Extensions from installed packages load and their tools register
- Standalone extensions from `~/.pi/agent/extensions/` load
- Extension-registered tools are callable by the LLM
- Extension event hooks fire (tool_call, agent_start, etc.)
- Skills still inject into system prompt correctly

### Phase 3.4 — Renderer: Store + Shared Components

**Files to create:**
- `src/stores/resource-store.ts` — Replaces skill-store.ts
- `src/components/panels/resources/ResourceBrowseView.tsx`
- `src/components/panels/resources/ResourceDetailView.tsx`
- `src/components/panels/resources/ResourceInstallView.tsx`
- `src/components/panels/resources/ResourceCreateView.tsx`
- `src/components/panels/resources/ResourceCard.tsx`
- `src/components/panels/resources/RestartIndicator.tsx`
- `src/components/panels/Resources.css`

**Files to delete:**
- `src/stores/skill-store.ts`
- `src/components/panels/SkillsPanel.tsx`
- `src/components/panels/SkillsPanel.css`
- `src/components/panels/skills/BrowseView.tsx`
- `src/components/panels/skills/DetailView.tsx`
- `src/components/panels/skills/InstallView.tsx`
- `src/components/panels/skills/CreateView.tsx`

### Phase 3.5 — Renderer: Resource Panels

**Files to create:**
- `src/components/panels/PackagesPanel.tsx`
- `src/components/panels/ExtensionsPanel.tsx`
- `src/components/panels/SkillsPanel.tsx` (new, uses shared components)
- `src/components/panels/PromptsPanel.tsx`
- `src/components/panels/ThemesPanel.tsx`

**Files to modify:**
- `src/components/TiledWorkspace.tsx` — Register 5 new panel types, remove old `skills` type
- `electron/preload.ts` — Replace `skills` namespace with `resources` namespace

**Acceptance:**
- Each panel has Browse, Install, Create sub-views
- Search, toggle, uninstall work for all resource types
- Restart indicator appears when config changes
- All CSS uses design system variables, consistent with existing UI

### Phase 3.6 — Polish + Preload Cleanup

- Remove all `skills:*` IPC remnants
- Remove `electron/skill-manager.ts`, `electron/skill-installer.ts`
- Remove `useSkillAutocomplete.ts` (or adapt for resources)
- Update `AGENTS.md` with new architecture
- Update `docs/skills.md` → `docs/resources.md`
- Test extension loading errors, npm failures, git failures
- Verify per-project enable/disable across all types

---

## 9. Key Files Summary

### New Files

| File | Purpose |
|------|---------|
| `electron/resource-manager.ts` | Core manager: discovery, listing, enable/disable |
| `electron/resource-installer.ts` | npm/git/local install and uninstall logic |
| `electron/resource-discovery.ts` | Scan dirs, parse `package.json` pi manifests |
| `electron/resource-config.ts` | Read/write resources.json persistence |
| `electron/container-operations.ts` | SDK tool operation implementations for containers |
| `src/stores/resource-store.ts` | Zustand store for all resource UI state |
| `src/components/panels/PackagesPanel.tsx` | Packages dockview panel |
| `src/components/panels/ExtensionsPanel.tsx` | Extensions dockview panel |
| `src/components/panels/SkillsPanel.tsx` | Skills dockview panel (new) |
| `src/components/panels/PromptsPanel.tsx` | Prompts dockview panel |
| `src/components/panels/ThemesPanel.tsx` | Themes dockview panel |
| `src/components/panels/resources/ResourceBrowseView.tsx` | Shared browse/search/card grid |
| `src/components/panels/resources/ResourceDetailView.tsx` | Shared detail/metadata view |
| `src/components/panels/resources/ResourceInstallView.tsx` | Shared install flow |
| `src/components/panels/resources/ResourceCreateView.tsx` | Shared create-from-template flow |
| `src/components/panels/resources/ResourceCard.tsx` | Shared resource card component |
| `src/components/panels/resources/RestartIndicator.tsx` | "Restart agent" banner |
| `src/components/panels/Resources.css` | Shared styles |

### Modified Files

| File | Changes |
|------|---------|
| `electron/main.ts` | Instantiate ResourceManager, cleanup |
| `electron/agent-manager.ts` | Use DefaultResourceLoader + ResourceManager |
| `electron/agent-tools.ts` | SDK tool factories with container operations |
| `electron/agent-system-prompt.ts` | Use ResourceManager for skills |
| `electron/ipc-handlers.ts` | Replace `skills:*` with `resources:*` |
| `electron/preload.ts` | Replace `skills` with `resources` namespace |
| `src/components/TiledWorkspace.tsx` | Register 5 resource panel types |

### Deleted Files

| File | Reason |
|------|--------|
| `electron/skill-manager.ts` | Replaced by resource-manager.ts |
| `electron/skill-installer.ts` | Replaced by resource-installer.ts |
| `src/stores/skill-store.ts` | Replaced by resource-store.ts |
| `src/components/panels/SkillsPanel.tsx` (old) | Replaced |
| `src/components/panels/SkillsPanel.css` | Replaced by Resources.css |
| `src/components/panels/skills/*.tsx` | Replaced by resources/*.tsx |

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SDK tool factory operations interfaces don't match container exec model | Blocks tool refactor | Medium | Inspect actual TypeScript types in `node_modules` before implementing; fall back to custom tools if incompatible |
| Extension loading crashes Electron main process | App crash | Low | Load extensions in try/catch, skip broken ones, log errors |
| DefaultResourceLoader discovers resources we don't want (e.g. from cwd) | Unexpected behavior | Medium | Set `cwd` to container workspace path; test with projects that have `.pi/` dirs |
| npm install inside Sero's package dir has permission issues | Install fails | Low | Test early; may need `--prefix` flag |
| Conversation loss on "Restart Agent" frustrates users | UX friction | Medium | Clear messaging in restart indicator; consider saving chat history before restart |
| Large number of resources makes panels slow | Performance | Low | Virtual scrolling if list exceeds ~100 items |

---

## 11. Open Questions

1. **Package updates** — Pi has `pi update` for non-pinned packages. Should Sero support an "Update all" button? (Deferred to post-v1)
2. **Package filtering** — Pi supports filtering what a package loads (include/exclude patterns). Should the UI expose this? (Deferred)
3. **Extension settings** — Some extensions may have configuration. No UI for this in v1.
4. **Theme preview** — Should switching themes preview in the Sero UI or only affect the agent? (Deferred — themes are Pi TUI concepts)
5. **Prompt template usage** — How do prompt templates integrate with Sero's agent chat? Slash commands? (Needs UX design)

---

## 12. Relationship to Pi SDK Exports Used

| Pi SDK Export | Used For |
|---------------|----------|
| `DefaultResourceLoader` | Extension/skill/prompt/theme discovery and loading |
| `createAgentSession` | Agent session with loaded extensions |
| `createBashTool` / `createReadTool` / etc. | Tool factories with container operations |
| `loadSkillsFromDir` | Skill discovery (used inside ResourceManager) |
| `formatSkillsForPrompt` | System prompt skill section |
| `type Skill` | Skill type definition |
| `type PromptTemplate` | Prompt template type |
| `type ToolDefinition` | Custom tool definitions (read_terminal, read_skill) |
| `AuthStorage` / `ModelRegistry` | Auth and model management (unchanged) |
| `SessionManager.inMemory()` | In-memory sessions (unchanged) |
| `SettingsManager.inMemory()` | Sero-managed settings (unchanged) |
