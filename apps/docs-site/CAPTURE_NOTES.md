# Documentation capture playbook

This file controls screenshots and other media for the public documentation site. It is outside the Rspress content root, so the site does not publish it.

## Capture ownership

The documentation orchestrator owns all application startup and media capture. Documentation workers must not run Sero or replace media.

Workers can report a stale or unsafe image. They must keep the existing file and provide a capture brief. The orchestrator replaces the image only after a new capture passes the accuracy and privacy checks.

This serial process prevents several workers from changing the same profile, application process, plugin state, or screenshot directory.

## Selected capture method

Use a hybrid method. No single tool has reliable control of every Sero surface.

| Surface | Primary method | Fallback | Reason |
| --- | --- | --- | --- |
| Electron shell, federated plugin, dialog, or popover | Playwright Electron fixture | `agent-browser` over a dedicated CDP port | Playwright can create deterministic state and crop exact elements. The current repository already has documentation capture helpers. |
| Current desktop session that is difficult to recreate in a fixture | `agent-browser` over a dedicated CDP port | `sero app` commands | `agent-browser` can inspect visible controls and capture the active Electron target. |
| Sero app panel or long plugin panel | `sero app screenshot`, `screenshot-around`, or selector capture | Playwright crop | The host capture service uses Electron `capturePage()` and can target the visible app panel or a scrollable selector. |
| Visible Browser or preview page | `sero browser` and Sero capture commands | `agent-browser` | Sero commands preserve the product boundary between Browser content and app panels. |
| Web Remote or docs-site page | `agent-browser` | Playwright Chromium | CDP gives stable navigation, element selection, viewport control, and screenshot output. |

Do not use screen coordinates when a role, text, selector, or element crop is available. Do not use a full desktop screenshot when an app or element crop can show the same fact.

## Serial capture process

1. Collect capture briefs from all documentation slices.
2. Reject briefs that do not support an adjacent user task or product fact.
3. Start one disposable Sero profile with a dedicated CDP port.
4. Use one sample workspace and synthetic plugin data.
5. Capture the approved queue in route order.
6. Check each image against the current UI and its capture brief.
7. Check the image for private paths, credentials, account details, LAN addresses, and session data.
8. Replace the tracked image only after both checks pass.
9. Record the application commit, viewport, crop, sample state, and destination path.
10. Stop Sero and remove the disposable profile and temporary data.

The preferred viewport is 1440 by 900 CSS pixels for shell views. Use a smaller element crop when the full shell makes the subject difficult to read in the documentation column.

## Safe fixtures

Use a disposable profile under a temporary `SERO_HOME_OVERRIDE`. Do not use the normal `~/.sero-ui` profile.

The fixture can contain:

- a public or synthetic repository with short paths;
- synthetic sessions and prompts;
- fake model endpoints with no token;
- local plugin records that do not contain account data;
- fake financial, health, calendar, email, and task data.

Do not capture real repositories, email, banking data, health data, API keys, profile names, account identifiers, local network addresses, or absolute personal paths.

## Capture brief template

Use one section for each new or replacement image.

```md
### `assets/<path>/<file>.png`

- Route and section:
- User task or product fact:
- Exact screen and visible controls:
- Synthetic profile, workspace, and records:
- Required state or result:
- Information that must not appear:
- Viewport, crop, and surrounding context:
- Preferred method and fallback:
- Source or test that proves the image is current:
- Existing asset to retain until replacement:
```

## Media rules

- Prefer still screenshots. Use video only when motion is the subject.
- Preserve an existing asset until an approved replacement exists.
- Do not reuse an unrelated image to fill a gap.
- Crop or hide token fields, profile paths, provider keys, and private file names.
- Keep useful surrounding controls when they help the reader locate the feature.
- Record an omission when a safe and useful capture is not possible.

## Required screenshot and media matrix

| Asset | Page | Captured from | Viewport | Data hygiene | Status |
| --- | --- | --- | --- | --- | --- |
| `explorer/workspace-overview.png` | Explorer Workspace | Explorer file tree, editor, and terminal | 1440×900 target | sample repository, no private paths | existing images remain under `assets/images/` |
| `containers/dev-server-preview.png` | Containers and Dev Servers | container-backed development server preview | 1440×900 target | sample app and disposable workspace | requires desktop and container runtime |
| `cli/sero-cli-help.png` | Sero CLI reference | terminal with `sero --help` or namespace help | 1200×800 target | no private working directory or tokens | reference remains text-first unless an image adds value |
| `models/lm-studio-success.png` | Local LLMs with LM Studio | local model provider success state | 1440×900 target | fake endpoint, no token | requires an LM Studio fixture |
| `subagents/subagent-results.png` | Subagents | delegated subagent result panel | 1440×900 target | synthetic prompt and sample workspace | requires a reproducible subagent fixture |
| `browser-capture/app-recording.mp4` | Browser and Capture | short app screenshot or record workflow | 1440×900 target | sample app only | motion capture remains deferred until it adds value |
| `evals/promptfoo-results.png` | Running Evals and Testing Reference | promptfoo result view | 1440×900 target | no provider keys or private prompts | text workflow remains sufficient unless a result view adds value |
| `plugins/catalog-overview.png` | Plugin Catalog and Plugins and Apps | catalog or plugin management UI | 1440×900 target | sample or local plugins, no secrets | existing plugin screenshots remain |
| `plugins/google-oauth-redacted.png` | Google plugin | OAuth or connection state | 1440×900 target | fake account or redacted identity | do not use a real account |
| `plugins/starling-demo-redacted.png` | Starling plugin | bank plugin demo data | 1440×900 target | fake banking data only | do not capture real banking data |
| `plugins/weight-demo-redacted.png` | Weight Tracker plugin | demo weight data | 1440×900 target | fake health data only | do not capture personal health data |
| `plugins/loom-studio.png` | Loom | full-canvas generated artwork | 1224×720 crop | synthetic artwork; no host profile details | captured 2026-07-09 |
| `plugins/loom-controls.png` | Loom | generated artwork with Controls panel, prompt bar, and rail | 1224×720 crop | synthetic artwork; no host profile details | captured 2026-07-09 |
| `plugins/agent-plugins-preview.png` | Agent Plugins | Admin > Plugins > Agent Plugins | 1022 CSS pixel crop | disposable profile and public example package | captured 2026-08-07 |
| `plugins/agent-plugins-details.png` | Agent Plugins | installed card with details open | 1022 CSS pixel crop | disposable profile; no profile paths | captured 2026-08-07 |
| `plugins/agent-plugins-cli.png` | Agent Plugins | Show in Sero CLI with namespace | 1022 CSS pixel crop | disposable profile; no profile paths | captured 2026-08-07 |
| `plugins/agent-plugins-remove.png` | Agent Plugins | remove dialog with keep-data choice | 416 CSS pixel crop | disposable profile | captured 2026-08-07 |

## Proposed asset directories

This directory layout is a future organization proposal only. For current
manual captures, use the in-place output paths in `CAPTURE_QUEUE.md`.

- `shell/` for the desktop shell, sidebar, title bar, status bar, and global Chat.
- `explorer/` for Explorer, the editor, terminals, previews, and source control.
- `containers/` for runtime and development server views.
- `cli/` for command output when an image is useful.
- `models/` for providers, tiers, local models, and LM Studio.
- `subagents/` for subagent definitions and result panels.
- `browser-capture/` for visual and app control.
- `evals/` for eval workflows and results.
- `plugins/` for the catalog and plugin-specific captures.
