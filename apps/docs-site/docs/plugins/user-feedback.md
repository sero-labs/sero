# User Feedback Plugin

> Status: **built-in plugin**. It ships in the Sero source tree.

## Overview

Built-in app for pending user questions and questionnaires. The manifest declares an app UI and `bridgeTools: false`.

## Try it first

1. Install or activate the plugin from a trusted source. For local development, use **Admin → Plugins → Local Plugin Development** rather than treating an attached folder as an installed plugin.
2. Open the app from the sidebar/App Store if the manifest exposes a UI.
3. Use fake/demo data for the first run.
4. Ask Sero for a small, reversible action before relying on the plugin in real work.

When Sero asks for input, answer in the pending question/questionnaire surface rather than assuming the agent can proceed without you.

## Surfaces from the manifest/source

| Surface | Source-checked detail |
| --- | --- |
| Package | `@sero-ai/plugin-user-feedback` |
| Status | built-in |
| App state | Manifest declares plugin-owned state under `.sero/apps/<app-id>/...` when an app is present. |

## Privacy, secrets, and recovery

Answers may contain private instructions or decisions. Redact pending questions and responses before sharing screenshots. This built-in plugin is not removed through Plugin Manager.

If setup fails, confirm the plugin is active in the current profile, check required host capabilities, restart Sero, and collect redacted logs only. Do not include tokens, account identifiers, email content, banking data, health data, or private workspace paths in support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
