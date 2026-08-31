# Plugin Extension Points

Extension points let a plugin add a component or a standard control to a
location owned by Sero. The host owns the location, layout, lifecycle, and
validation. A plugin cannot invent a new host surface.

## Main app, components, and controls

These manifest concepts are separate:

| Manifest field | Owner | Purpose |
| --- | --- | --- |
| `sero.app.component` | Plugin | The plugin's main app surface. |
| `sero.app.contributes.components` | Plugin | Extra federated React components mounted in host-defined locations. |
| `sero.app.contributes.controls` | Host | Standard controls rendered by Sero and backed by a plugin action. |

Every contribution needs an `id` that is unique inside its extension point.
The same ID can appear in two different extension points. Sero combines it
with the app ID and extension point as
`<app-id>:<extension-point>:<contribution-id>`, which gives every mounted
contribution a distinct identity.

## Supported extension points

| Extension point | Kind | Point-specific fields | Host composition |
| --- | --- | --- | --- |
| `ui.global-search.panel` | Component | `description?` | One panel or tabbed panels |
| `ui.explorer.view` | Component | `label?`, `icon?` | Explorer activity item and main view |
| `ui.titlebar.control` | Component | None | Inline title-bar controls |
| `ui.admin.model-settings` | Component | `name`, `description?`, `icon?` | Admin Model subsection |
| `ui.dashboard.widget` | Component | `name`, `defaultSize?`, `minSize?`, `maxSize?`, `description?` | Dashboard grid |
| `workspace.create.option` | Control | `switch` control and `tool` action | Create New Workspace form |

All component entries require `id`, `extensionPoint`, and `component`. The
`component` value identifies a Module Federation exposed-module key. For
example, `"KnowledgeSearch"` maps to the `"./KnowledgeSearch"` key in the
plugin's `exposes` configuration. The source module must have a default React
component export. Dashboard sizes default to `2 × 2` when omitted.

An Admin model-settings contribution must also have a non-empty `name`. Admin
uses this provider-neutral name in its Model subsection selector. The
contributed component owns all provider labels, controls, and state.

## Component example

This app has one main component and contributes three additional components:

```json
{
  "sero": {
    "app": {
      "id": "knowledge",
      "name": "Knowledge",
      "icon": "waypoints",
      "stateFile": ".sero/apps/knowledge/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "KnowledgeApp",
      "contributes": {
        "components": [
          {
            "id": "global-search",
            "extensionPoint": "ui.global-search.panel",
            "component": "KnowledgeSearch",
            "description": "Search indexed knowledge"
          },
          {
            "id": "summary",
            "extensionPoint": "ui.dashboard.widget",
            "component": "KnowledgeSummaryWidget",
            "name": "Knowledge summary",
            "defaultSize": { "w": 2, "h": 2 },
            "minSize": { "w": 1, "h": 1 },
            "maxSize": { "w": 4, "h": 3 }
          },
          {
            "id": "model-settings",
            "extensionPoint": "ui.admin.model-settings",
            "component": "KnowledgeModelSettings",
            "name": "Knowledge provider",
            "description": "Knowledge model defaults"
          }
        ]
      }
    }
  }
}
```

Each contributed component is wrapped in the standard app runtime context and
plugin style scope. The host can unmount it when the surface closes or changes.
Keep state that must survive an unmount in plugin-owned state.

## Control example

Controls are data, not arbitrary React components. The first supported control
is `switch`. The first supported action invokes an app-local extension tool.

```json
{
  "contributes": {
    "controls": [
      {
        "id": "workspace-indexing",
        "extensionPoint": "workspace.create.option",
        "control": {
          "type": "switch",
          "label": "Enable indexing",
          "defaultValue": true
        },
        "action": {
          "type": "tool",
          "tool": "enable_index",
          "params": { "mode": "full" }
        }
      }
    ]
  }
}
```

After Sero creates the workspace, it adds `workspaceId`, `workspaceName`, and
`workspacePath` to the action arguments. Host values override static `params`.
A failed optional action does not undo a workspace that was created
successfully. Declare `appAgent.invokeTool` in `requiredHostCapabilities` when
the plugin depends on this action bridge.

## Validation and compatibility

Electron validates all contribution data before the renderer receives it:

- `components` and `controls` must be arrays when present
- required strings must be non-empty
- IDs must be unique inside one extension point
- the extension point, control type, and action type must be host-defined
- only point-specific allowlisted fields are retained

An unknown or malformed optional entry is ignored and recorded as a diagnostic.
It does not disable unrelated plugin features. Federated components are still
subject to the plugin runtime ABI check.

Extension points are optional by default. If the plugin cannot work without
Admin model settings, declare `ui.admin.model-settings` in
`sero.plugin.requiredHostCapabilities`. The host then rejects installation on
builds that do not provide the point. Use `sero.plugin.minSeroVersion` for other
release-level requirements.

## Legacy manifests

Electron still normalises these old fields for installed external plugins:

| Compatibility field | Canonical extension point |
| --- | --- |
| `search` | `ui.global-search.panel` |
| `explorerView` | `ui.explorer.view` |
| `titlebar` | `ui.titlebar.control` |
| `widgets[]` | `ui.dashboard.widget` |
| `workspaceCreation` | `workspace.create.option` |

Explicit canonical entries take precedence so a plugin can carry both forms
during migration without rendering duplicates. New plugins must use
`sero.app.contributes`.

## Static and runtime widgets

A static widget is a federated component contribution to
`ui.dashboard.widget`. Use this when the widget is always available with the
plugin.

`useWidgetRegistration()` is a separate app-runtime API. Use it when widget
availability is decided at runtime. Its registration is sticky for the current
renderer session, even if the component that called the hook unmounts. For
manual lifecycle control, `registerWidget()` returns an unregister function.
Both paths use the same host-owned widget chrome and dashboard components.

## See also

- [Plugins](/reference/plugins)
- [Plugin Author Quick Path](/reference/plugin-author-quick-path)
- [Dashboard and Widgets](/guide/dashboard-widgets)
- [Dashboard Components](/reference/dashboard-components)
