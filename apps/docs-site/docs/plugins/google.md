# Google Plugin

> Status: **external/local plugin**. It is not bundled with Sero unless installed or activated as a local plugin development session.

## Overview

Gmail and Calendar app for Sero via `gogcli`, with app UI, background runtime, Mail/Calendar widgets, and bridged `google`, `gmail`, and `gcal` tools.

## Try it first

1. Install or activate the plugin from a trusted source. For local development, use **Admin → Plugins → Local Plugin Development** rather than treating an attached folder as an installed plugin.
2. Open the app from the sidebar/App Store if the manifest exposes a UI.
3. Use fake/demo data for the first run.
4. Ask Sero for a small, reversible action before relying on the plugin in real work.

Install or activate the external checkout, install `gogcli` as the README requires, complete Google OAuth with a test account, then ask Sero to summarize a fake/demo calendar agenda.

## Surfaces from the manifest/source

| Surface | Source-checked detail |
| --- | --- |
| Package | `@sero-ai/plugin-google` |
| Status | external/local |
| App state | Manifest declares plugin-owned state under `.sero/apps/<app-id>/...` when an app is present. |

## Privacy, secrets, and recovery

Google OAuth credentials and mailbox/calendar contents are sensitive. Do not paste real message bodies, invite links, or account identifiers into public issues. Runtime/background capability is required by the manifest.

If setup fails, confirm the plugin is active in the current profile, check required host capabilities, restart Sero, and collect redacted logs only. Do not include tokens, account identifiers, email content, banking data, health data, or private workspace paths in support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
