# Plugin Extension-Point Framework

**Status:** Proposed

**Branch:** `design/generic-extension-point-framework`

**Depends on:** PR #356, which introduces the first host-rendered plugin control

## Summary

Sero will replace its separate contribution paths with one typed extension-point
framework. The public app manifest will make a clear distinction between:

- **components**, which are federated React components rendered and owned by a
  plugin; and
- **controls**, which are standard host-rendered controls backed by a
  plugin-owned action.

The host continues to own every extension point, its placement, composition,
context and lifecycle. Plugins can contribute to extension points the host
defines. They cannot invent new host locations or inject arbitrary UI into
unapproved surfaces.

Existing manifest fields remain supported and are normalised into the same
internal contribution model.

## Problem

Sero currently supports several plugin contribution types:

- `sero.app.widgets`
- `sero.app.search`
- `sero.app.explorerView`
- `sero.app.titlebar`
- `sero.app.workspaceCreation`

Each contribution type has its own:

1. package manifest field;
2. Electron parser;
3. renderer manifest type;
4. app-store selector;
5. mount or action executor; and
6. host-surface integration.

The UI contribution mounts repeat the same Module Federation,
`AppProvider`, `PluginStyleScope`, workspace hydration, loading and failure
logic. Adding another extension point requires copying this infrastructure.

The existing fields are also inconsistent. Most name a plugin-rendered React
component, while `workspaceCreation` describes a host-rendered switch and tool
action. A flat generic `contributions` array would remove code duplication but
would make this important ownership boundary less clear to plugin authors.

## Goals

- Make contributed React components explicit in the public app manifest.
- Make host-rendered controls explicit and separate from contributed
  components.
- Provide one typed internal contribution model and query API.
- Reuse one safe federated-component mount implementation.
- Reuse one safe plugin-tool action executor.
- Allow multiple contributions from one plugin to the same extension point.
- Preserve host ownership of layout, composition and lifecycle.
- Preserve compatibility with existing plugin manifests.
- Keep unsupported optional extension points non-fatal.
- Keep contribution errors isolated from the host and other plugins.

## Non-goals

- Plugins cannot define new host surfaces.
- Plugins cannot provide arbitrary React components where the host expects a
  standard control.
- Manifest actions cannot execute JavaScript callbacks, shell commands or
  arbitrary host APIs.
- This framework does not replace the primary app component, background app
  runtimes, Pi extensions, model providers or plugin compatibility metadata.
- This framework does not keep hidden plugin views mounted.
- This framework does not create a universal layout component for all host
  surfaces.

## Terminology

| Term | Meaning |
| --- | --- |
| Extension point | A named location and contract owned by the Sero host. |
| Component contribution | A plugin-rendered federated React component inserted into a host extension point. |
| Control contribution | A host-rendered control that invokes a plugin-owned action. |
| Contribution ID | A stable identifier unique within one app manifest. |
| Resolved contribution | A validated contribution combined with its owning app manifest. |

## Public Manifest Contract

The primary app component remains separate:

```json
{
  "sero": {
    "app": {
      "id": "graphify",
      "component": "GraphifyApp",
      "contributes": {
        "components": [],
        "controls": []
      }
    }
  }
}
```

This reads as: the app's main component is `GraphifyApp`, and the app also
contributes additional components and controls to named host extension points.

### Component contributions

Component contributions name a federated React component exported by the
plugin UI bundle:

```json
{
  "contributes": {
    "components": [
      {
        "id": "global-search",
        "extensionPoint": "ui.global-search.panel",
        "component": "GraphifySearch",
        "description": "Search the profile-wide knowledge graph"
      },
      {
        "id": "code-graph-widget",
        "extensionPoint": "ui.dashboard.widget",
        "component": "GraphifySummaryWidget",
        "name": "Code graph",
        "defaultSize": { "w": 2, "h": 2 }
      }
    ]
  }
}
```

Every component contribution has these common fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Stable ID unique within this app's contributions. |
| `extensionPoint` | string | Yes | Host extension point that receives the component. |
| `component` | string | Yes | Exported federated React component name. |

Each extension point can add validated point-specific fields. For example,
dashboard widgets define sizing metadata and Explorer views can define a label
and icon.

### Control contributions

Control contributions describe host-rendered UI and a plugin action:

```json
{
  "contributes": {
    "controls": [
      {
        "id": "workspace-indexing",
        "extensionPoint": "workspace.create.option",
        "control": {
          "type": "switch",
          "label": "Enable Graphify indexing",
          "defaultValue": true
        },
        "action": {
          "type": "tool",
          "tool": "graphify_index",
          "params": {
            "action": "enable"
          }
        }
      }
    ]
  }
}
```

Every control contribution has these common fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Stable ID unique within this app's contributions. |
| `extensionPoint` | string | Yes | Host extension point that receives the control. |
| `control` | object | Yes | Allowlisted host control description. |
| `action` | object | Yes | Allowlisted plugin action description. |

The first supported control is `switch`. The first supported action is
`tool`. New control and action types require an explicit host implementation.

### Identity

Contribution IDs must be unique across `components` and `controls` within one
app. The host creates the global identity:

```text
<app-id>:<contribution-id>
```

Stable identity is used for React keys, diagnostics, hot reload and any future
persisted contribution preferences.

## Initial Extension-Point Catalogue

| Extension point | Kind | Existing manifest source | Host composition |
| --- | --- | --- | --- |
| `ui.global-search.panel` | Component | `search` | One panel or tabbed panels |
| `ui.explorer.view` | Component | `explorerView` | Explorer activity-bar item and main view |
| `ui.titlebar.control` | Component | `titlebar` | Inline title-bar controls |
| `ui.dashboard.widget` | Component | `widgets[]` | User-configured dashboard grid |
| `workspace.create.option` | Control | `workspaceCreation` | Switches in the Create New Workspace form |

The primary `sero.app.component` is not an extension-point contribution. It
defines the app's own main surface and navigation identity.

## Type Model

Canonical renderer-safe contracts should live in
`@sero-ai/common`, for example `packages/common/src/app-contributions.ts`.

```ts
export interface ComponentContributionBase {
  id: string;
  extensionPoint: ComponentExtensionPointId;
  component: string;
}

export interface ControlContributionBase {
  id: string;
  extensionPoint: ControlExtensionPointId;
  control: HostControlDefinition;
  action: ContributionActionDefinition;
}

export interface AppContributions {
  components: ComponentContribution[];
  controls: ControlContribution[];
}
```

Point-specific types form discriminated unions:

```ts
export type ComponentContribution =
  | GlobalSearchPanelContribution
  | ExplorerViewContribution
  | TitleBarControlContribution
  | DashboardWidgetContribution;

export type ControlContribution = WorkspaceCreationOptionContribution;
```

The extension-point ID is the discriminator. This preserves compile-time
point-specific fields while allowing generic discovery and selection.

## Discovery and Validation

Electron remains the trust boundary for plugin manifests.

Discovery will:

1. read `sero.app.contributes`;
2. verify that `components` and `controls` are arrays when present;
3. validate the common contribution fields;
4. find the host definition for the named extension point;
5. validate point-specific fields;
6. reject duplicate contribution IDs within the app;
7. record diagnostics for malformed or unknown entries;
8. combine valid entries with legacy normalised contributions; and
9. return one canonical `AppContributions` object on `SeroAppManifest`.

Plugin-provided schemas or parsers are not allowed. All extension-point
definitions are compiled into the host.

An unknown extension point is ignored with a diagnostic. It does not disable
the plugin. If a plugin cannot function without an extension point introduced
by a newer Sero release, it must set an appropriate `minSeroVersion`. Older
hosts cannot enforce a requirement declared only inside a manifest structure
they do not understand.

Federated UI contributions remain subject to the plugin runtime ABI check.
Actions remain subject to declared host capabilities such as
`appAgent.invokeTool`.

## Legacy Manifest Normalisation

Existing fields remain supported:

```text
search             -> ui.global-search.panel
explorerView       -> ui.explorer.view
titlebar           -> ui.titlebar.control
widgets[]          -> ui.dashboard.widget
workspaceCreation  -> workspace.create.option
```

Normalisation happens only in Electron discovery. The renderer consumes only
the canonical `manifest.contributions` shape.

Explicit `contributes` entries take precedence over legacy entries for the
same contribution:

- Single-contribution legacy points (`search`, `explorerView`, `titlebar`,
  `workspaceCreation`) are ignored when the app declares an explicit new
  contribution for that extension point.
- Legacy widgets are ignored when an explicit dashboard contribution has the
  same widget ID. Other legacy widgets are still normalised.

This permits a package to carry old and new declarations during a migration
without rendering duplicates in a new host.

Built-in plugins will migrate to `contributes` as part of this work. Legacy
normalisation remains for external plugins.

## Contribution Selection

The renderer app store continues to own discovered app manifests. It does not
need a second mutable contribution store.

The separate selectors are replaced by one typed query:

```ts
getContributions(apps, 'ui.global-search.panel');
getContributions(apps, 'ui.explorer.view');
getContributions(apps, 'workspace.create.option');
```

The result combines each contribution with its owner:

```ts
export interface ResolvedContribution<C> {
  key: string;
  appId: string;
  app: AppEntry;
  manifest: SeroAppManifest;
  contribution: C;
}
```

The query excludes host-incompatible apps and preserves deterministic order:

1. app discovery order;
2. manifest order within each app; and
3. contribution ID as a final stable tie-break when required.

Extension points keep control of any stronger ordering rules. A global plugin
priority field is not part of the first release.

## Federated Component Mounting

The repeated component wrappers become one shared primitive:

```tsx
<FederatedContributionMount
  manifest={resolved.manifest}
  component={resolved.contribution.component}
  loading={<SearchLoading />}
  unavailable={<SearchUnavailable />}
/>
```

It owns:

- `useAppRuntimeMount` context resolution;
- Module Federation component resolution;
- `AppProvider`;
- `PluginStyleScope`;
- `Suspense`;
- per-contribution error isolation; and
- consistent plugin and surface identity attributes.

It does not own the host surface layout. Global Search still owns tabs,
Explorer still owns its activity bar, the title bar still owns inline
placement, and the dashboard still owns its grid.

Point-specific host props can be passed only when the extension-point contract
defines them. The first migration should continue to prefer `AppProvider`
context and plugin-owned state over adding new callback props.

Contributed views unmount when hidden. Their federated module and plugin-owned
module stores can remain cached according to the existing Module Federation
LRU behaviour.

## Host-Rendered Controls and Actions

Host surfaces interpret only the control definitions allowed by their
extension-point contract. A workspace-creation option currently accepts a
switch:

```ts
interface SwitchControlDefinition {
  type: 'switch';
  label: string;
  defaultValue: boolean;
}
```

The shared action executor accepts only an app-local tool action:

```ts
interface ToolContributionAction {
  type: 'tool';
  tool: string;
  params?: Record<string, unknown>;
}
```

Execution uses the existing generic bridge:

```ts
window.sero.appAgent.invokeTool(
  resolved.appId,
  workspaceId,
  action.tool,
  {
    ...action.params,
    ...hostContext,
  },
);
```

Host context always overrides static manifest parameters. Each extension point
defines its context contract. `workspace.create.option` supplies:

```ts
interface WorkspaceCreatedContributionContext {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
}
```

The executor returns structured success and failure results. The calling host
surface decides whether to show feedback. Optional contribution failure must
not roll back a successfully created workspace.

## Security Boundaries

- Only host-defined extension-point IDs are accepted.
- Only host-defined fields are retained after parsing.
- Component contributions can load only named exports from the owning plugin's
  registered Module Federation remote.
- Control contributions render only allowlisted host components.
- Actions can invoke only the owning app's extension tools through the existing
  app-agent bridge.
- Manifest parameters cannot replace host-supplied context fields.
- Incompatible plugin remotes remain blocked by the federation registry.
- Each mounted contribution has an error boundary so one plugin cannot remove
  the whole host surface.

## Lifecycle and Development Sessions

Plugin install, uninstall and local development events continue through the
existing app-discovery lifecycle.

When a plugin changes:

1. the host invalidates its federated module cache;
2. Electron produces a new canonical manifest;
3. the renderer replaces or rediscovers the app entry;
4. contribution queries derive the new result set; and
5. affected mounted contributions reload using their stable identities.

Control contributions update from the same manifest change and need no
separate lifecycle channel.

## Documentation and Authoring Guidance

The implementation is not complete until the public documentation and the
agent authoring guidance describe the canonical manifest. Do not publish the
new syntax before the host can discover, validate and render it.

### Repository documentation

Update the source documentation that plugin maintainers use:

- `docs/plugins/guide.md`
- `docs/plugins/technical.md`
- `docs/plugins/host-compatibility.md`
- `docs/plugins/quickstart.md`
- `docs/plugins/end-to-end-example.md`

The documentation must:

- explain the difference between `sero.app.component`, contributed components
  and contributed controls;
- list each supported extension point and its point-specific fields;
- show complete component and control manifest examples;
- describe validation, compatibility and legacy normalisation;
- state that extension points are host-defined and cannot be invented by a
  plugin; and
- direct new plugins to use `sero.app.contributes` while identifying the old
  fields as compatibility syntax only.

### Documentation site

Add a dedicated plugin extension-point reference page under
`apps/docs-site/docs/reference/` and add it to the plugin-author sidebar in
`apps/docs-site/rspress.config.ts`.

Also update these existing pages:

- `apps/docs-site/docs/reference/plugins.md`
- `apps/docs-site/docs/reference/plugin-author-quick-path.md`
- `apps/docs-site/docs/reference/plugin-quickstart.md`
- `apps/docs-site/docs/reference/plugin-end-to-end-example.md`
- `apps/docs-site/docs/guide/dashboard-widgets.md`

The docs site must use the same examples and terminology as the repository
documentation. Static manifest widgets must use a component contribution with
`extensionPoint: "ui.dashboard.widget"`. Runtime widget registration remains a
separate app-runtime API in the first release.

### Plugin-authoring skills

Update the template skills that create and style plugin UI:

- `packages/templates/skills/sero-plugin/SKILL.md`
- `packages/templates/skills/sero-plugin/references/templates.md`
- `packages/templates/skills/sero-plugin/references/api-and-widgets.md`
- `packages/templates/skills/sero-plugin/example/`
- `packages/templates/skills/sero-dashboard-ui/SKILL.md`
- `packages/templates/skills/sero-dashboard-ui/references/widget-patterns.md`

The `sero-plugin` skill must generate the canonical `contributes.components`
and `contributes.controls` syntax. It must not generate a legacy contribution
field for a new plugin. Its Notes example must exercise the canonical dashboard
widget declaration.

The `sero-dashboard-ui` skill must explain that a static widget is a federated
component contributed to `ui.dashboard.widget`. It must keep the host-widget
chrome and shared-component guidance unchanged. It must distinguish this
static manifest path from `useWidgetRegistration()` for runtime widgets.

After these template package changes are merged, publish the affected package
version so new profiles receive the updated skills.

## Implementation Plan

### Phase 1: canonical contracts

- Add renderer-safe contribution types and extension-point IDs to
  `@sero-ai/common`.
- Add `contributes` package manifest input types to Electron discovery.
- Add canonical `contributions` output to `SeroAppManifest`.
- Add validation diagnostics and duplicate-ID checks.

### Phase 2: legacy normalisation

- Convert all existing contribution parser results into canonical component or
  control contributions.
- Implement explicit-over-legacy precedence rules.
- Add regression tests for old external-plugin manifests.

### Phase 3: generic selection

- Add the typed `getContributions` query.
- Replace the Search, Explorer, title-bar and workspace-creation selectors.
- Migrate dashboard widget discovery to the same query.

### Phase 4: generic component mounting

- Extract `FederatedContributionMount` from the existing mounts.
- Keep point-specific surface composition and fallback content.
- Add per-contribution error isolation.
- Verify workspace and global app scope behaviour.

### Phase 5: generic control actions

- Extract the tool-action executor from the workspace creation flow.
- Preserve parallel execution and failure isolation.
- Return structured execution results to host surfaces.

### Phase 6: built-in plugin migration

- Migrate Graphify Search and workspace indexing.
- Migrate Git Explorer and title-bar components.
- Migrate all built-in dashboard widgets.
- Remove built-in usage of legacy fields while keeping legacy discovery.

### Phase 7: documentation and verification

- Update the repository plugin documentation listed above.
- Add the docs-site extension-point reference and update related author pages.
- Update the `sero-plugin` and `sero-dashboard-ui` skills and their examples.
- Document every supported extension point and point-specific payload.
- Verify that repository docs, docs-site examples and template skills use the
  same canonical manifest syntax.
- Build the docs site and validate both skill folders.
- Add manifest discovery, normalisation, selector, mount, action and hot-reload
  tests.
- Run monorepo typecheck and focused desktop/plugin test suites.

## Acceptance Criteria

- Plugin authors can clearly distinguish their primary app component,
  contributed components and contributed host controls from the manifest.
- All current contribution surfaces consume the canonical registry.
- No current host surface has its own app-contribution selector.
- All federated contribution surfaces use the shared mount primitive.
- Workspace creation uses the shared control-action executor introduced after
  PR #356.
- Existing external plugin manifests continue to work without modification.
- New manifests can contribute multiple components to one extension point.
- Unknown and malformed contributions produce diagnostics without crashing the
  host.
- Unsupported or failed optional contributions do not disable unrelated plugin
  functionality.
- Host-owned layout and plugin-owned component state remain separate.
- Repository documentation and the docs site describe the canonical extension
  point contract.
- The `sero-plugin` and `sero-dashboard-ui` skills generate and explain the
  canonical static contribution syntax.
- No new authoring example uses a legacy manifest contribution field.
- All touched source files remain below 500 lines.

## Decisions

1. The public field is `contributes`, not a flat `contributions` array.
2. The public manifest separates `components` and `controls`.
3. Component entries explicitly name both `extensionPoint` and `component`.
4. Host controls use an allowlisted `control` definition and `action`.
5. The initial action type is an app-local `tool` invocation.
6. The host owns extension-point definitions and validation.
7. Existing manifest fields remain supported through Electron normalisation.
8. The renderer consumes only canonical contributions.
9. The framework provides shared transport, selection, mounting and execution,
   but host surfaces retain their own composition.
10. Extension-point support is optional by default. Plugins that require a new
    point must declare a compatible `minSeroVersion`.
