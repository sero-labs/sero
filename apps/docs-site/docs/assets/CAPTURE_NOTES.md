# Capture Notes

This file tracks screenshot and media hygiene for the public docs site. Use it before adding or replacing assets under `apps/docs-site/docs/assets/`.

## Rules

- Use disposable Sero profiles and sample workspaces.
- Do not capture or commit secrets, private repositories, real email, banking data, API keys, personal health data, or account identifiers.
- Prefer still screenshots. Use MP4/GIF only when motion is the feature being explained.
- Crop or hide token fields, profile-specific paths, provider keys, and private file names.
- Record the app commit/version, viewport, profile type, and data hygiene notes when possible.
- If a capture cannot be produced in a pass, record the omission reason instead of reusing unrelated images.

## Required screenshot/media matrix

| Asset | Page | Captured from | Viewport | Data hygiene | Status |
|---|---|---|---|---|---|
| `shell/desktop-shell-overview.png` | Home, Workspace, Architecture | current desktop shell with Explorer + chat | 1440×900 target | sample workspace only | existing legacy image in `assets/desktop-shell-overview.png`; recapture needed into stable directory |
| `explorer/workspace-overview.png` | Explorer Workspace | Explorer file tree/editor/terminal | 1440×900 target | sample repo, no private paths | omitted this pass; existing images remain under `assets/images/` |
| `containers/dev-server-preview.png` | Containers and Dev Servers | container-backed dev server preview | 1440×900 target | sample app and disposable workspace | omitted this pass; requires running desktop + container runtime |
| `cli/sero-cli-help.png` | Sero CLI reference | terminal running `sero --help` or namespace help | 1200×800 target | no private cwd or tokens | omitted this pass; CLI reference remains text-first |
| `models/lm-studio-success.png` | Local LLMs with LM Studio | local model provider success/test state | 1440×900 target | fake endpoint/no token visible | omitted this pass; requires LM Studio runtime |
| `subagents/subagent-results.png` | Subagents | delegated subagent result panel | 1440×900 target | synthetic prompt and sample workspace | omitted this pass; requires reproducible subagent demo |
| `browser-capture/app-recording.mp4` | Browser and Capture | short app screenshot/record workflow | 1440×900 target | sample app only | omitted this pass; motion capture deferred until demo data is prepared |
| `evals/promptfoo-results.png` | Running Evals / Testing Reference | promptfoo result view | 1440×900 target | no provider keys or private prompts | omitted this pass; text workflow documents commands |
| `plugins/catalog-overview.png` | Plugin Catalog / Plugins and Apps | catalog or plugin management UI | 1440×900 target | sample/local plugins, no secrets | omitted this pass; existing plugin screenshots remain under `assets/images/` |
| `plugins/google-oauth-redacted.png` | Google plugin | OAuth/connect state | 1440×900 target | fake account/redacted identity | omitted this pass; avoid real account capture |
| `plugins/starling-demo-redacted.png` | Starling plugin | bank plugin demo data | 1440×900 target | fake/demo banking only | omitted this pass; do not capture real banking data |
| `plugins/weight-demo-redacted.png` | Weight Tracker plugin | demo weight data | 1440×900 target | fake/demo health data only | omitted this pass; do not capture personal health data |

## Stable asset directories

- `shell/` — desktop shell, sidebar, title bar, status bar, global chat.
- `explorer/` — Explorer, editor, terminals, previews, source control.
- `containers/` — container runtime, dev-server registry, host-mode comparisons.
- `cli/` — command/help screenshots when text is insufficient.
- `models/` — providers, tiers, local model setup, LM Studio.
- `subagents/` — subagent definitions, result panels, collaboration/debate.
- `browser-capture/` — screenshots and recordings for visual/app control.
- `evals/` — promptfoo/eval workflow images.
- `plugins/` — plugin catalog and plugin-specific captures.

## Current omissions

No new screenshots or recordings were captured in this pass. The docs continue to use existing source-only alpha screenshots under `assets/images/` and top-level legacy images where already present. Missing captures are explicit above so future passes can replace them with stable, redacted assets.
