# Plugin contribution seams — what a plugin can give the host today

Research for [#296](https://github.com/sero-labs/sero/issues/296), a child of the
"Wayfinder: unify the git/VCS UX" map ([#294](https://github.com/sero-labs/sero/issues/294)).

**Facts only.** This document makes no recommendation and proposes no architecture. Every
claim cites the source that owns it. Paths are repo-relative; line numbers are as of commit
`d554c0627`.

---

## Summary of findings

| # | Question | Answer in one line |
|---|---|---|
| 1 | Existing contribution slots | Two manifest slots (`sero.app.search`, `sero.app.widgets`) plus one imperative runtime registry (`registerWidget`). All three mount a federated component directly into the host React tree. |
| 2 | Cost of a new slot type | ~12 files is the floor for any new slot. An explorer side panel is ~15 files (a closed string union must be widened in 3 places). A titlebar popover is ~13 files and has no union/persistence problem. Zero changes to the federation registry or the build config either way. |
| 3 | Can a plugin open a host editor tab? | It can open a **file** (`openSeroFile`). It cannot open a **DiffTab** — no API exists at any layer, and the diff state is component-local `useState`, not a store. Adding one is ~5 renderer-only files; no IPC is required. |
| 4 | Can plugin code reach `window.sero.vcs`? | Yes. A federated remote runs in the host's own JS realm with no sandbox. `getSeroApi()` narrows the *type*, not the *access*. There is no allowlist, capability gate or proxy anywhere. |
| 5 | Styling reality | A scoped plugin **does** inherit host design tokens, by ordinary CSS custom-property inheritance. `plugin.css` deliberately does not import `globals.css` — it imports an alias-only `plugin-theme.css`. Current in-repo version is 0.4.2 (fixed). |

---

## 1. Existing contribution slots

### 1.1 The full path a contribution takes

Both existing slots follow one identical pipeline. Nothing about it is slot-specific until
the last two steps.

| Stage | Where |
|---|---|
| Plugin declares the slot in `package.json` | `plugins/sero-graphify-plugin/package.json` (search), `plugins/sero-git-plugin/package.json` (widgets) |
| Plugin exposes the module via Module Federation | `plugins/sero-graphify-plugin/vite.config.ts:29-32`, `plugins/sero-git-plugin/vite.config.ts:25-29` |
| Host build auto-scans plugin remotes | `apps/desktop/vite.config.ts:40-41`, `:63-94`, `:102-110` |
| Main process parses the manifest | `apps/desktop/electron/features/apps/discovery/index.ts:125-160` |
| Manifest reaches the renderer over IPC | channel `sero:apps:discover`, `apps/desktop/src/types/ipc-channels.ts:117`; handler `apps/desktop/electron/ipc/apps/apps.ts:36-44`; preload `apps/desktop/electron/preload/apps/app-domain.ts:61-63` |
| Renderer store ingests it | `apps/desktop/src/stores/app/discovery.ts:91-93` |
| A selector picks the contributing apps | `apps/desktop/src/stores/app/shared.ts:117-120` |
| A host mount component renders the remote | `SearchContributionMount.tsx`, `WidgetMount.tsx` |

The build-time remote scan is **per app, not per slot**: it keys off `sero.app.id` /
`component` / `devPort` only (`apps/desktop/vite.config.ts:63-94`) and produces one MF remote
name per plugin (`sero_<id>`, `:76`). A plugin that already ships any UI needs no build-config
change to contribute a second, third or fourth surface.

### 1.2 `sero.app.search` — exact shape

Manifest type — `apps/desktop/src/types/search-manifest.ts:2-7`:

```ts
export interface SearchManifest {
  component: string;      // exported component name from the MF remote
  description?: string;   // shown in search entry points (⌘K item)
}
```

- Singular, not an array: one search panel per plugin.
- Attached to the app manifest at `apps/desktop/src/types/sero-apps.ts:69-70`
  (`search?: SearchManifest | null`).
- Parsed at `apps/desktop/electron/features/apps/discovery/index.ts:154-160`. Validation is
  one check: `component` must be a non-empty string, otherwise the slot is `null`. It is also
  nulled when UI is suppressed (`:216`).
- Worked example — `plugins/sero-graphify-plugin/package.json`:
  ```json
  "search": { "component": "GraphifySearch",
              "description": "Search the profile-wide knowledge graph" }
  ```
  exposed at `plugins/sero-graphify-plugin/vite.config.ts:31`.

**Mount component** — `apps/desktop/src/components/layout/search/SearchContributionMount.tsx:18-53`:

```tsx
const { contextValue, status } = useAppRuntimeMount(manifest);   // :19
const LazyComponent = manifest.search
  ? getFederatedComponent(manifest.id, manifest.search.component,
      manifest.devPort, manifest.remoteEntryOverride)            // :31-36
  : null;
return (
  <AppProvider value={contextValue}>                             // :43
    <PluginStyleScope pluginId={manifest.id} surfaceId={surfaceId}>  // :44
      <div data-sero-plugin={manifest.id} className="contents">  // :45
        <Suspense fallback={<SearchPanelLoading />}>             // :46
          <LazyComponent />
```

Failure states are silent-but-visible strings, not errors: `"No workspace selected"` (`:27`),
`"Search panel unavailable"` (`:39`).

**Container and lifecycle** — `apps/desktop/src/components/layout/search/GlobalSearchDialog.tsx`:

- Rendered unconditionally at `apps/desktop/src/App.tsx:336`, but returns `null` when no app
  contributes (`GlobalSearchDialog.tsx:41-42`).
- Opened from the sidebar and ⌘K via `useGlobalSearchStore` (`apps/desktop/src/stores/global-search.ts:17-23`).
- One contribution renders full-bleed (`:62-68`); two or more get a tab strip (`:70-87`).
- The panel is inside a Radix `Dialog`, so it **unmounts on close and remounts on open** —
  no persistent instance. `GraphifySearch` compensates with a module-scoped session cache
  (`plugins/sero-graphify-plugin/ui/GraphifySearch.tsx:29-34`).
- The only host→plugin control channel is a window event: the plugin calls `closeSeroSearch()`
  (`packages/app-runtime/src/app-launch.ts:60-63`), the dialog listens
  (`GlobalSearchDialog.tsx:35-39`) via `SERO_GLOBAL_SEARCH_CLOSE_EVENT`
  (`app-launch.ts:53`). No IPC, no store coupling.

What the panel gets from the host: everything in `AppContextValue` — `appId`, `workspaceId`,
`workspacePath`, `stateFilePath`, `promptAgent`, `themeMode`, `themePresetId`
(`packages/app-runtime/src/context.ts:11-30`), assembled by
`apps/desktop/src/components/apps/useAppRuntimeMount.ts:117-128`.

`GraphifySearch` is the sole existing example of a plugin contributing UI to a host surface —
`plugins/sero-graphify-plugin/ui/GraphifySearch.tsx:17-21` imports `closeSeroSearch`,
`openSeroApp`, `openSeroFile`, `useAppState`, `useAppTools`; it opens results with
`openSeroFile` (`:78`) and dismisses the overlay with `closeSeroSearch()` (`:79`).

### 1.3 `sero.app.widgets` — exact shape

Manifest type — `apps/desktop/src/types/widget-manifest.ts:2-17`: `id`, `name`, `component`,
`defaultSize {w,h}`, optional `minSize` / `maxSize` / `description`. Plural — an array
(`apps/desktop/src/types/sero-apps.ts:67-68`, `widgets: WidgetManifest[]`, non-optional).

Parsing is more forgiving than search: `apps/desktop/electron/features/apps/discovery/index.ts:125-152`
skips entries missing `id`/`name`/`component` (`:130`) and fills numeric defaults
(`defaultSize` → 2×2 at `:135-138`, `minSize` → 1×1, `maxSize` → 4×4).

**Mount component** — `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx:29-79`. Structurally
identical to the search mount (`AppProvider` → `PluginStyleScope` → `data-sero-plugin` div →
`Suspense`, `:68-78`), with two differences:

1. It is `memo`ised so grid drag/resize doesn't re-render the remote (`:24-29`).
2. It has a second branch for **runtime-registered** widgets (`:41-52`) which renders
   `widgetMeta.runtimeComponent` inside `AppProvider` **without** `PluginStyleScope`.

Lifecycle: widget instances live in `apps/desktop/src/stores/dashboard.ts` and are persisted to
`layout.json` via `persistLayout` (`:78-103`); available widgets are resolved from manifests plus
runtime widgets at `:131-175`.

### 1.4 The third, undocumented seam: `registerWidget()`

`packages/app-runtime/src/widget-registry.ts` is an **imperative in-realm registry** that needs
no manifest entry and no host change:

- `registerWidget(widget): () => void` (`:97-110`) — takes a live `ComponentType` (`:23`).
- Backed by a `globalThis` singleton so every federated copy of `@sero-ai/app-runtime` shares
  one registry (`:42-59`, comment at `:8-9`).
- The host subscribes via `getRuntimeWidgets` / `onWidgetRegistryChange`
  (`apps/desktop/src/components/apps/dashboard/useRuntimeWidgets.ts:11-14`).

This is the existing precedent for a contribution mechanism that skips the manifest → IPC →
store pipeline entirely. Its cost: runtime widgets are only registered while the registering
module is loaded, and they are mounted **without** `PluginStyleScope`
(`WidgetMount.tsx:47-51`).

### 1.5 `getFederatedComponent` — how a slot resolves

`apps/desktop/src/lib/federation-registry.ts:423-463`.

- Signature: `(appId, component: string | null, devPort, remoteEntryOverride) => LazyExoticComponent | null`.
  Returns `null` immediately when `component` is falsy (`:429`).
- Cache key is `` `${appId}/${component}::${override ?? (devPort ? 'dev:'+devPort : 'default')}` ``
  (`:81-88`) — **already component-scoped**, which is why a new slot type needs no registry change.
- Remote name: `sero_${appId.replace(/-/g,'_')}` (`:61-63`); module path is `${remoteName}/${component}` (`:304`).
- Entry candidates, in order (`:91-107`): explicit `remoteEntryOverride` → `http://localhost:<devPort>/remoteEntry.js`
  in development → always `sero-ext://<appId>/mf-manifest.json`.
- Each candidate is probed with a 1.5 s aborted `fetch`; only successes are cached (`:166-195`).
- Registration: `registerRemotes([...], { force: true })` (`:218`) after removing any stale
  runtime remote (`:145-157`).
- Loading: `loadRemote<RemoteModule>(modulePath)` (`:322`), falling through to the next candidate
  on throw (`:328-334`). The exposed module must have a **default export**
  (`:32`, `:323`) — `plugins/sero-graphify-plugin/ui/GraphifySearch.tsx:159` complies.
- Caching/eviction: three maps (`:40`, `:43`, `:46`), `MAX_CACHED_MODULES = 5` (`:37`), LRU
  eviction exempting pinned apps (`:248-253`).
- On total failure it logs `[federation] Failed to load remote: …`, clears the cache key and
  renders `() => null` (`:450-453`).

---

## 2. What a new slot type costs

### 2.1 The floor for any new slot (~12 files)

1. New manifest type file in `apps/desktop/src/types/` (model: `search-manifest.ts`).
2. `apps/desktop/src/types/sero-apps.ts` — import, re-export alias, field on `SeroAppManifest`
   (3 edits, next to `:6-7`, `:15-16`, `:67-70`).
3. `apps/desktop/src/types/ipc.ts:274` — add the alias to the renderer re-export.
4. `apps/desktop/electron/features/apps/discovery/index.ts` — 3 edits: a `Pkg*Def` interface
   (near `:29-42`), a field on `PkgSeroApp` (near `:44-58`), a `parse*()` plus its line in
   `buildManifest`'s return (near `:125-160`, `:215-216`).
5. `apps/desktop/src/stores/app/shared.ts` — a selector next to `:117-120`.
6. A new `*ContributionMount.tsx` (copy of `SearchContributionMount.tsx:18-70`).
7. The host render site for the new surface.
8. Docs ×4: `docs/plugins/guide.md:347-372`, `docs/plugins/technical.md:140-212`,
   `packages/templates/skills/sero-plugin/references/api-and-widgets.md:370-383`,
   `apps/docs-site/docs/reference/plugin-author-quick-path.md:82-92`.
9. Tests ×2: parse assertions in
   `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts:172-194`, plus a mount
   test modelled on `WidgetMount.test.tsx`.

**Needs no change for any new slot:** `apps/desktop/src/lib/federation-registry.ts` (cache key
is already `(appId, component)`-scoped); `apps/desktop/vite.config.ts` (remote scan is
slot-agnostic, `:63-110`); IPC channels, preload bridges and main-process handlers (a new slot
rides `sero:apps:discover`); `packages/common` (holds only `sero.plugin` metadata);
`apps/desktop/electron/features/workspace/plugin-validation.ts` (checks only `sero.app.id`/`name`);
`apps/desktop/electron/features/plugins/dev-sessions/manifest.ts` (reads only
`id/name/component/ui/devPort`).

### 2.2 Case (a) — a persistent explorer side panel (~15 files)

The explorer's panel set is a **closed string union**, not a registry:

- `apps/desktop/src/components/apps/explorer/ActivityBar.tsx:9` —
  `export type ExplorerPanel = 'explorer' | 'git' | 'orchestration' | 'browser' | 'terminal'`
- `ActivityBar.tsx:19-25` — a hardcoded `items` array with inline Lucide icon JSX.
- `apps/desktop/src/components/apps/explorer/ExplorerSidebar.tsx:7-13` — hardcoded
  `panelTitles: Record<ExplorerPanel, string>`; `:53-63` — a hardcoded if/else chain rendering
  `MultiRootFileTree` / `VcsPanel` / `OrchestrationPanel`.
- `apps/desktop/src/stores/explorer.ts:33-43` — an `EXPLORER_PANELS` set + `isExplorerPanel()`
  used to validate the persisted `activePanel` (`:54-56`).
- `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx:45` — `showSidebar` special-cases
  `'browser'`; `:68-98` — `handlePanelClick` special-cases panels; `:176-223` — the
  `ActivityBar` + resizable sidebar layout.

On top of the ~12-file floor, this adds:

- Widening `ExplorerPanel` and making `items` runtime-computed (`ActivityBar.tsx:9`, `:19-25`),
  with icons resolved through `apps/desktop/src/lib/app-icons.ts` (`getAppIcon`, as
  `GlobalSearchDialog.tsx:23,107` already does) instead of JSX literals.
- Making `panelTitles` and the render chain extensible (`ExplorerSidebar.tsx:7-13`, `:53-63`).
- Making the persisted-state validator accept contributed ids (`stores/explorer.ts:33-43`),
  otherwise a persisted plugin panel silently resets to `'explorer'` on next launch (`:54-56`).
  `LayoutState.activePanel` itself is already `string` (`apps/desktop/src/types/layout.ts:15`), so
  no layout-type change is needed.
- Routing contributed ids through the generic sidebar branch in `ExplorerWorkspace.tsx:45,68-98`.

The expensive part is the union closing the type in three places plus the persistence validator.

### 2.3 Case (b) — a titlebar popover (~13 files)

The titlebar is a fixed layout with no contribution seam
(`apps/desktop/src/components/layout/shell/TitleBar.tsx:33-124`; the right-hand action cluster is
`:90-115`). Prior art for the exact interaction already exists:
`apps/desktop/src/components/layout/titlebar/git/GitTitleBarControls.tsx:25` (open state),
`:125-162` (`Popover` / `PopoverTrigger asChild` / `PopoverContent side="bottom" align="end"`).

On top of the ~12-file floor:

- A new `TitlebarContributionMount.tsx` where the **host** owns the `Popover` and trigger button
  (which must carry `no-drag` and `chrome-zoom-invariant`, per `TitleBar.tsx:51,61,90,113`) and
  mounts the federated component inside `PopoverContent`.
- A one-line insertion into `TitleBar.tsx:90-115`.
- **Portal caveat:** `PluginStyleScope` appends its portal container to `document.body`
  (`packages/ui/src/plugin-style-scope.tsx:19-23`) and Radix `PopoverContent` also portals to
  body. Whether the host wraps only the popover *content's children* in the scope, or the plugin
  owns the popover, is a real decision, not a copy-paste.
- Optional: a `closeSeroTitlebarPopover()` + event constant in
  `packages/app-runtime/src/app-launch.ts` (exact prior art at `:53,60-63`) and the barrel at
  `packages/app-runtime/src/index.ts`. That makes it an **npm republish of
  `@sero-ai/app-runtime`**, plus a host listener mirroring `GlobalSearchDialog.tsx:35-39`.

No string union to widen, no persisted state to migrate — (b) is strictly cheaper than (a).

---

## 3. Can a plugin open a host editor tab?

### 3.1 The full `@sero-ai/app-runtime` export surface

Barrel: `packages/app-runtime/src/index.ts:8-31`.

| Export | Signature | Source |
|---|---|---|
| `AppContext` / `AppProvider` | `Context<AppContextValue \| null>` (globalThis singleton) | `context.ts:36-43` |
| `AppContextValue` | `{ appId; workspaceId; workspacePath; stateFilePath; promptAgent?; themeMode?; themePresetId? }` | `context.ts:11-30` |
| `useAppState` | `<T>(defaultState: T): [T, (updater: (prev: T) => T) => void]` | `use-app-state.ts:46` |
| `useAppInfo` | `(): { appId; workspaceId; workspacePath }` | `use-app-info.ts:8-14` |
| `useAgentPrompt` | `(): (text: string) => void` | `use-agent-prompt.ts:20` |
| `useAI` | `(): { prompt(text); promptStream(text, onDelta) }` | `use-ai.ts:18-25` |
| `useAppTools` | `(): { run(toolName, params?) }` | `use-app-tools.ts:7-11` |
| `useAvailableModels` | `(): { groups; loading; error; refresh() }` | `use-available-models.ts:12-23` |
| `useSubagentContext` | `(workspaceId): { context; loading; error; refresh() }` | `use-subagent-context.ts:13-20` |
| `useContextPresets` | `(): { presets; save(next); loading; error }` | `use-context-presets.ts:13-21` |
| `useTheme` | `(): { mode; presetId }` | `use-theme.ts:12-19` |
| `getSeroApi` | `(): SeroBridge` — throws outside the shell | `sero-bridge.ts:121-127` |
| `openSeroApp` | `(appId, params?) => Promise<boolean>` | `app-launch.ts:31-39` |
| **`openSeroFile`** | **`(workspaceId, filePath) => Promise<boolean>`** | **`app-launch.ts:48-50`** |
| `closeSeroSearch` | `() => void` (window CustomEvent) | `app-launch.ts:60-63` |
| `SERO_GLOBAL_SEARCH_CLOSE_EVENT` | `'sero:global-search:close'` | `app-launch.ts:53` |
| `consumeAppLaunchParams` / `onAppLaunchParams` | launch-param handoff | `app-launch.ts:70-94` |
| `registerWidget` / `getRuntimeWidgets` / `onWidgetRegistryChange` / `useWidgetRegistration` | runtime widget registry | `widget-registry.ts:97,113,118`; `use-widget-registration.ts:52` |

**There is no `openSeroDiff`, no tab API, and no editor-tab export of any kind.**

### 3.2 How `openSeroFile` actually works

It is neither a pure event bus nor a pure IPC call — it is a renderer → main → renderer
round-trip that terminates in a Zustand store:

1. `packages/app-runtime/src/app-launch.ts:48-50` — `getSeroApi().appControl?.openFile(...)`.
2. `apps/desktop/electron/preload/apps/app-domain.ts:129-130` — `ipcRenderer.invoke(IpcChannels.appControl.openFile, …)`.
3. `apps/desktop/src/types/ipc-channels.ts:421,431` — `'sero:app-control:open-file'`.
4. `apps/desktop/electron/ipc/apps/app-control.ts:39-41` — `ipcMain.handle` → host service.
5. `apps/desktop/electron/features/apps/app-control/host-service.ts:160-163` —
   `execRenderer('window.__appControl?.openFile(…)')`, i.e. `webContents.executeJavaScript`
   **back into the same renderer**.
6. `apps/desktop/src/lib/app-control-bridge.ts:101-106` — sets `activeApp='explorer'`, then
   `useEditorBridge.getState().requestOpenFile(...)`.
7. `apps/desktop/src/stores/editor-bridge.ts:63-78` — `focusEditor()`, path-normalise, set `pendingOpen`.
8. `apps/desktop/src/components/apps/explorer/useExplorerEditorState.ts:91-104` — a store
   subscription consumes `pendingOpen`, appends to `editorTabs`, sets `activeTab`.

The main-process hop is architecturally redundant for a plugin living in the same renderer; it
exists because this pipe is shared with the CLI/agent path.

### 3.3 How a DiffTab is opened today

**There is no tab store for diffs. Diff state is component-local React state.**

- Component: `apps/desktop/src/components/apps/explorer/editor/DiffTab.tsx:34`
  (`DiffTab({ state }: { state: DiffTabState })`); state shape at `:22-28`
  (`{ type:'diff'; workspaceId; fromRev; toRev; initialPath? }`); it loads its own data with
  `window.sero.vcs.fileDiffSummary(...)` (`:47-49`) and renders `DiffChangeset` (`:120-131`).
- The only creating function: `useExplorerEditorState.ts:142-153` — `handleOpenDiff(fromRev, toRev, path?)`
  calls `setDiffState({...})`.
- Backing state: `useExplorerEditorState.ts:35` — `useState<DiffTabState | null>(null)`. **`useState`,
  not Zustand.** Force-cleared on every workspace change (`:40-43`).
- Reached only by prop drilling: `ExplorerWorkspace.tsx:211` → `ExplorerSidebar.tsx:29,56` →
  `VcsPanel.tsx:24,103,135` → `CommitLog.tsx:22,67` → `CommitDetail.tsx:209,232` and
  `WorkingCopySection.tsx:108-124`.
- Render site: `ExplorerWorkspace.tsx:235-256` — when `diffState` is set, the diff replaces
  `EditorPanel` (`:258-267`). The diff is **modal over** the editor, not a peer in the tab bar.

### 3.4 Definitive answer, and what adding a path would involve

**No — there is no existing path, at any layer, for plugin code to open a DiffTab.**

- `app-runtime` exposes exactly two navigation calls and neither carries revisions
  (`app-launch.ts:31-50`).
- The preload contract `SeroAppControlBridge` has exactly two methods, `open` and `openFile`
  (`packages/app-runtime/src/sero-bridge.ts:46-51`).
- `window.__appControl` has no diff method (`apps/desktop/src/lib/app-control-bridge.ts:39-58`).
- `useEditorBridge` carries only `{ workspaceId, filePath }` (`apps/desktop/src/stores/editor-bridge.ts:15`).
- `handleOpenDiff` is a `useCallback` closed over `useState`; it is not exported, not on
  `window`, and not in any store.

**No IPC is required to add one.** A federated plugin already runs in the host renderer, and
`closeSeroSearch` is the precedent: a plain `window.dispatchEvent` that the host listens for
(`app-launch.ts:60-63` + `GlobalSearchDialog.tsx:35-39`). The renderer-only route is 5 files:

1. `packages/app-runtime/src/app-launch.ts` — `SERO_OPEN_DIFF_EVENT` + `openSeroDiff(workspaceId, fromRev, toRev, path?)`.
2. `packages/app-runtime/src/index.ts` — barrel export → **npm republish of `@sero-ai/app-runtime`**.
3. `apps/desktop/src/stores/editor-bridge.ts` — a `pendingDiff` field + request/consume actions
   (reusing `focusEditor()` at `:63-70`).
4. `apps/desktop/src/components/apps/explorer/useExplorerEditorState.ts` — a second subscription
   branch alongside `:91-104` calling the existing `setDiffState` (`:35`, `:142-153`).
5. `apps/desktop/src/App.tsx` (near `:336`) — the window-event listener.

Full IPC parity (only needed if the **main process**, the agent or the CLI must also trigger it)
adds 5-6 more layers: `ipc-channels.ts:421-431`, `preload/apps/app-domain.ts:129`,
`ipc/apps/app-control.ts:39-41`, `features/apps/app-control/host-service.ts:160-163`,
`lib/app-control-bridge.ts:44,101-106`, plus keeping `types/electron-apps.d.ts:86-109` and
`sero-bridge.ts:46-51` in sync.

**Structural blocker, independent of transport:** `diffState` is `useState` inside
`useExplorerEditorState` and is cleared on workspace change, so any external opener must arrive
through a store the hook subscribes to. `useEditorBridge` is the only such channel today and it
is file-path-only.

An existing escape hatch worth noting: `app-control-bridge.ts:161-167` already smuggles a
`devserver://` scheme through `openFile`'s `filePath`. A `diff://…` string would ride the
existing pipe with zero new IPC, but `useExplorerEditorState` would still need to special-case
it, and the result would be an `editorTabs` string, not `diffState`.

---

## 4. What surface can plugin code actually reach?

### 4.1 A federated remote runs in the host's own JS realm — no sandbox

- The host loads remotes with the MF runtime and renders the resolved default export inline via
  `React.lazy`: `apps/desktop/src/lib/federation-registry.ts:24-30`, `:218`, `:322`, `:441-448`.
- Every mount is a plain React child of the host tree — no iframe, no webview, no shadow root:
  `SeroAppMount.tsx:60-72`, `WidgetMount.tsx:68-78`, `SearchContributionMount.tsx:42-52`. (The
  only iframes in the app are `FilePreviewPane.tsx:152`, `DevServerPreview.tsx:138`,
  `HtmlPreview.tsx:73` — none wrap plugin mounts.)
- React is a shared singleton across host and remotes: `apps/desktop/vite.config.ts:168-180`,
  `plugins/sero-git-plugin/vite.config.ts:20-36`, `plugins/sero-graphify-plugin/vite.config.ts:23-38`.
- Two `globalThis` singletons only work because there is one realm:
  `packages/app-runtime/src/context.ts:36-41` (`__sero_app_context__`) and
  `packages/ui/src/plugin-style-scope-context.ts:12-17`.
- Renderer security settings (`apps/desktop/electron/app-main.ts:219-221`,
  `apps/desktop/electron/platform/security/window-security.ts:73-78`) set `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. That separates **preload** from the main world; it
  does not separate host code from plugin code, which both live in that main world.

### 4.2 `window.sero` and `vcs`

- Exposed by `apps/desktop/electron/preload.ts:5-7` — `contextBridge.exposeInMainWorld('sero', seroApiContract)`.
- The object is assembled at `apps/desktop/electron/preload/api.ts:50-100` with ~50 top-level
  namespaces, including `vcs: vcsBridge` (`:77`) alongside `gitApp` (`:63`), `github` (`:79`),
  `shell`, `safeStorage`, `container`, `terminal`, `layout`, `themes`, `net`, and the rest.
- Typed at `apps/desktop/src/types/electron.d.ts:413` (`interface SeroAPI`), `:448`
  (`vcs: SeroVcsAPI`), `:465-468` (`declare global { interface Window { sero: SeroAPI } }`).
  Domain types in `apps/desktop/src/types/vcs.ts`.

**Answer: yes.** Plugin code can call `window.sero.vcs.*` exactly as host code does. Host code
already does — e.g. `DiffTab.tsx:47-49` calls `window.sero.vcs.fileDiffSummary(...)`.

### 4.3 `getSeroApi()` narrows the type, not the access

`packages/app-runtime/src/sero-bridge.ts:121-127`:

```ts
export function getSeroApi(): SeroBridge {
  const sero = readWindowSero(window);           // Reflect.get(window, 'sero')  :107-109
  if (!isSeroBridge(sero)) { throw new Error('[app-runtime] window.sero not available …'); }
  return sero;
}
```

- `isSeroBridge` duck-checks only `'appState' in value && 'appAgent' in value` (`:111-116`).
- `SeroBridge` declares just 9 members — `appState`, `appAgent`, `appControl?`, `gitApp?`,
  `webApp?`, `editor?`, `models?`, `subagentContext?`, `contextPresets?` (`:95-105`). The file
  header says so explicitly (`:1-8`, "declares only the subset app-runtime hooks need").
- The **returned object is the whole `window.sero`**. A cast recovers everything, including `vcs`.

### 4.4 There is no runtime restriction of any kind

- No `new Proxy(window…)`, no `Object.freeze`, no property deletion in production code. The only
  `Reflect.deleteProperty(window, 'sero')` hits are test teardown
  (`apps/desktop/src/stores/editor-bridge.test.ts:52`, `apps/desktop/src/lsp/use-lsp.test.tsx:132`).
- `sero.plugin.requiredHostCapabilities` exists
  (`apps/desktop/electron/features/apps/discovery/plugin-meta.ts:33,52-63,136-154`) but is used
  only for install-time compatibility (`apps/desktop/electron/features/plugins/compatibility.ts:21,176`)
  and App Store search text (`apps/desktop/src/components/layout/AppStoreDialog.tsx:44`). It gates
  nothing at runtime.
- App manifest validation covers `id/name/icon/stateFile/component/devPort/widgets/search/styleIsolation`
  only — no permission field exists (`discovery/index.ts:30-56,165-195`).
- The doctor check defers the question: `apps/desktop/electron/features/doctor/engine/checks/plugins.ts:143`
  — `'Plugin sandboxed load check deferred to v2.'`

Plugins already exploit this. Real examples:

- `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:44,62,66,87,96` — `window.sero.userFeedback.*`.
- `plugins/sero-web-plugin/ui/lib/host.ts:3-19` — a local `getHost()` cast over `window.sero`,
  then `appControl.openFile`, `shell.showItemInFolder`, `editor.delete`.
- `../plugins/sero-starling-plugin/ui/lib/crypto.ts:12-21` — `window.sero.safeStorage.encrypt/decrypt`;
  `.../ui/lib/api.ts:70-71` — `window.sero.net.fetch`.
- `plugins/sero-admin-plugin/ui/hooks/host.ts:1-6` — a dedicated typed accessor module for the
  admin plugin's slice of `window.sero`.

### 4.5 `gitApp` — a host bridge both sides consume

Worth recording because the map's baseline finding #2 describes it as "the plugin's bridge":

- It is owned by the **host preload**: `apps/desktop/electron/preload/apps/app-domain.ts:110-113`,
  wired at `apps/desktop/electron/preload/api.ts:63`; channel
  `apps/desktop/src/types/ipc-channels.ts:122`; main handler
  `apps/desktop/electron/ipc/apps/git-app.ts:11`.
- **Host UI calls it**: `apps/desktop/src/components/layout/titlebar/git/GitShipPanel.tsx:70,82` —
  `await window.sero.gitApp.run(workspaceId, { action: 'refresh' })`.
- **The plugin calls it too**: `plugins/sero-git-plugin/ui/GitApp.tsx:84-91` — `getSeroApi().gitApp`,
  with a defensive warn when absent (`:86`).

So the direction is inverted from the usual framing: the git plugin does not publish
`window.sero.gitApp`; the host does, and both sides consume one unscoped privileged bridge.

---

## 5. Styling reality

### 5.1 `packages/ui/src/styles/plugin.css` — current state (16 lines, verbatim)

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./plugin-theme.css";

@source "../components";

@custom-variant dark (&:is(.dark *));
```

- **It does NOT import `globals.css`.** It imports `./plugin-theme.css` (line 4).
- Neither `:root` nor `:scope` appears literally. Those selectors are *emitted* by Tailwind
  (preflight + `@theme` output) and rewritten at build time (see 5.2).
- `packages/ui/src/styles/plugin-theme.css` is 80 lines containing exactly one `@theme inline`
  block. Every entry is either a sizing/radius primitive (`:2-16`) or an **alias** —
  `--color-background: var(--background)` (`:17`), `--color-brand-primary: var(--brand-primary)`
  (`:19`), `--color-border: var(--border)` (`:64`). **It defines no concrete colour values.**

> Stale doc warning: `docs/plans/plugin-css-isolation.md:22` still describes the old behaviour
> ("That file imports the full shared `globals.css`"). The code no longer does that.

### 5.2 What `PluginStyleScope` actually does — and where the scoping really happens

`packages/ui/src/plugin-style-scope.tsx:10-35` **renders no wrapper element**. It:

1. creates a detached `<div>` with `data-sero-plugin` and `data-sero-plugin-portals` (`:11-17`);
2. appends it to `document.body` in `useInsertionEffect`, removing it on unmount (`:19-23`);
3. provides `{ pluginId, portalContainer }` on the shared context (`:25-34`).

Its only job is giving **portalled** UI (menus, dialogs, popovers) a body-level container that
still carries `data-sero-plugin`. Test: `packages/ui/src/plugin-style-scope.test.tsx:31-36`.

The DOM anchor for the actual CSS scope is the sibling div the **host mounts** render:
`SeroAppMount.tsx:64`, `WidgetMount.tsx:71`, `SearchContributionMount.tsx:45` — all
`<div data-sero-plugin={manifest.id} className="contents">`.

The isolation itself is a **build-time CSS transform**, `packages/plugin-vite/src/index.ts`:

- `:78` — `@scope ([data-sero-plugin="<id>"]) to ([data-sero-plugin])` wraps every rule (`:101-105`).
- `:119-142` — `rewriteSelector` replaces a **standalone** `:root`, `:host`, `html` or `body`
  with `:scope` (`:139`). Anything compound (`html.dark`, `:host(.compact)`, `:not(:root)`)
  is a hard build error (`:130-137`).
- `:85-91` — a runtime `@import` in plugin CSS is a build error.
- `:41-51` — the build fails if any emitted CSS asset lacks the `@scope` wrapper.
- Tests: `packages/plugin-vite/src/index.test.ts:7,15-22,54-55`.

### 5.3 `styleIsolation` — one legal value

- Only `"scope"`. Parse type at `apps/desktop/electron/features/apps/discovery/index.ts:46`;
  validation at `:169-172` (anything else logs and **rejects the whole manifest**); normalised to
  `null` when absent (`:190`). Renderer type: `apps/desktop/src/types/sero-apps.ts:23`
  (`styleIsolation?: 'scope' | null`). Test coverage incl. rejecting `'shadow'`:
  `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts:380-402`.
- **The host reads it in exactly one place** — `SeroAppMount.tsx:33-35`:
  ```ts
  useInsertionEffect(() => {
    if (manifest.styleIsolation !== 'scope') prioritizeFederatedStyles(manifest.id);
  }, [manifest.id, manifest.styleIsolation]);
  ```
  `prioritizeFederatedStyles` (`federation-registry.ts:384-398`) re-appends the plugin's
  stylesheet links to `document.head` so they win the cascade — the **legacy** path for
  un-scoped plugins.
- `WidgetMount.tsx` and `SearchContributionMount.tsx` never read `styleIsolation`; they always
  render `PluginStyleScope` and never call `prioritizeFederatedStyles`.
- All 9 in-repo UI plugins declare `"styleIsolation": "scope"` and pair it with
  `seroPluginCssScope({ pluginId })` after `tailwindcss()` (e.g.
  `plugins/sero-git-plugin/vite.config.ts:19`, `plugins/sero-graphify-plugin/vite.config.ts:21`).

### 5.4 Does a scoped plugin see host design tokens? — Yes

1. The host imports the host stylesheet: `apps/desktop/src/styles/global.css:1` —
   `@import "@sero-ai/ui/styles/globals.css";`
2. Host tokens are defined at **`:root`** — `packages/ui/src/styles/globals.css:14` — including
   `--bg-base` (`:16`), `--bg-surface` (`:17`), `--border-subtle` (`:23`), `--text-primary` (`:28`),
   `--text-muted` (`:30`), `--brand-primary` (`:34`), status colours (`:56-59`).
3. Dark mode is a **`.dark` class** on `document.documentElement`, not `[data-theme]`:
   `globals.css:319`; applied at `apps/desktop/src/stores/theme.ts:156-158`.
4. The plugin subtree is a descendant of `<html>`. `className="contents"` does not break custom
   property inheritance, and the element still exists as the `@scope` root.

Therefore `var(--bg-base)`, `var(--text-muted)`, `var(--border-subtle)`, `var(--brand-primary)`
resolve to the host's live, theme-aware values inside a plugin. Because `plugin-theme.css` only
aliases and never assigns a literal, `@sero-ai/ui`'s own colour defaults are never shipped in the
plugin bundle — **there is nothing to shadow the host**. The `dark:` variant also works, because
`plugin.css:8` declares `@custom-variant dark (&:is(.dark *))` and `html.dark` is an ancestor of
the scope root.

**The failure mode this design avoids** (the 0.4.1 bug): if `plugin.css` imported `globals.css`,
Tailwind would emit `:root { --brand-primary: #059669; … }` into the plugin bundle,
`seroPluginCssScope` would rewrite it to `:scope { … }`, and the default green would be pinned
onto the plugin's scope root, overriding the inherited host brand.

### 5.5 Version state

- **Current in-repo version is `0.4.2`** — `packages/ui/package.json:3` — i.e. the fixed state.
- `packages/ui/CHANGELOG.md` has **no 0.4.2 entry** (headings stop at `## 0.4.1`, line 3). The fix
  is recorded only in commit `f4070fef1`, which changed one line of `packages/ui/package.json`.
  The scoping machinery landed in `8996b6cb4` ("feat(plugins): isolate federated plugin CSS (#271)").
- In-repo plugins use `"@sero-ai/ui": "workspace:*"` and therefore always get the correct
  `plugin.css`. External plugins pin `^0.4.2` (e.g. `../plugins/sero-google-plugin/package.json:108`);
  `^0.4.2` only guarantees ≥ 0.4.2, so a stale lockfile entry can still reproduce the leak.
- `plugin.css` resolves through the wildcard export `"./styles/*"` (`packages/ui/package.json:13`,
  `publishConfig` at `:52`) — it has no dedicated export entry, so the failure mode was a
  published-artifact problem, not a config one.

### 5.6 What a plugin must do today to consume host tokens correctly

1. `ui/styles.css` begins `@import "@sero-ai/ui/styles/plugin.css";` — **not** `globals.css`
   (all 9 in-repo plugins comply, e.g. `plugins/sero-git-plugin/ui/styles.css:1`).
2. Add plugin-local `@source "./**/*.{ts,tsx}"`
   (`packages/templates/skills/sero-plugin/SKILL.md:213`).
3. Add `seroPluginCssScope({ pluginId })` **after** `tailwindcss()` in `vite.config.ts`.
4. Declare `"styleIsolation": "scope"` with `pluginId` matching `sero.app.id` **exactly**
   (`docs/plugins/guide.md:505-507`).
5. Use `var(--…)` / semantic Tailwind utilities (`bg-background`, `text-muted-foreground`,
   `border-border`) and **never redefine** `--bg-base` / `--text-muted` / `--brand-*` — a
   standalone `:root` block containing them becomes `:scope` and overrides the host.
6. Never write compound document selectors (`html.dark`, `:host(.x)`, `:not(:root)`) — hard build
   errors (`packages/plugin-vite/src/index.ts:130-137`). Use the `dark:` variant.
7. Never use a runtime `@import` in plugin CSS (`packages/plugin-vite/src/index.ts:85-91`).
8. Portalled UI must mount into `usePluginPortalContainer()`
   (`packages/ui/src/plugin-style-scope-context.ts:19-21`) or it lands outside any
   `[data-sero-plugin]` root and loses all plugin styling.

---

## Appendix — stale documentation encountered

Recorded as facts, not as work items:

- `docs/plugins/technical.md:367-371` describes `ensureRemoteRegistered()`, which no longer exists
  in `apps/desktop/src/lib/federation-registry.ts`.
- `docs/plans/plugin-css-isolation.md:22` states that `plugin.css` imports `globals.css`; it
  imports `plugin-theme.css` (`packages/ui/src/styles/plugin.css:4`).
- `apps/docs-site/docs/reference/app-runtime.md:5-22` does not document `openSeroFile`,
  `openSeroApp` or `closeSeroSearch`.
- `packages/ui/CHANGELOG.md` has no 0.4.2 entry.
