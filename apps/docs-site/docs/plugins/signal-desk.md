# Signal Desk Plugin

> Status: **external/local plugin**. It is not bundled with Sero unless installed or activated as a local plugin development session.

## Overview

RSS-first personal intelligence desk for Sero. Signal Desk tracks sources and watchlists, clusters feed items into stories, and turns high-signal changes into briefings, saved insights, and follow-up actions.

## Try it first

1. Install or activate the plugin from a trusted source. For local development, use **Admin → Plugins → Local Plugin Development** rather than treating an attached folder as an installed plugin.
2. Open Signal Desk from the sidebar/App Store if the manifest exposes a UI.
3. Click **Seed demo** before adding private feeds.
4. Refresh sources, select a story, and ask Sero for a concise briefing or follow-up action.

A safe first smoke test is: seed the AI tools demo, refresh the demo feeds, then ask Sero to summarize the highest-signal story and save it as an insight.

## Surfaces from the manifest/source

| Surface | Source-checked detail |
| --- | --- |
| Package | `@sero-ai/plugin-signal-desk` |
| Status | external/local |
| App ID | `signal-desk` |
| App state | `.sero/apps/signal-desk/state.json` |
| UI | Federated `SignalDeskApp` remote |
| Tool | Bridged `signal_desk` tool for sources, watchlists, refreshes, clusters, briefings, insights, and actions |
| Runtime | Background runtime is declared for workspace reconciliation/scheduling behavior |

## Privacy, secrets, and recovery

Feeds can reveal private research interests, customer names, repos, launches, or security concerns. Use public/demo feeds in screenshots and support reports. Do not paste private feed URLs, internal article text, customer names, or workspace paths into public issues.

If setup fails, confirm the plugin is active in the current profile, check required host capabilities, restart Sero, and collect redacted logs only. If the state file is malformed, repair or restore `.sero/apps/signal-desk/state.json` before running write actions.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
