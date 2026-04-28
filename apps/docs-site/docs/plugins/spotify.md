# Spotify Plugin

> Status: **external/local plugin**. It is not bundled with Sero unless installed or activated as a local plugin development session.

## Overview

Spotify app using the Spotify Web Playback SDK with playlist browsing, `spotify` tools, OAuth PKCE, and a Mini Player widget.

## Try it first

1. Install or activate the plugin from a trusted source. For local development, use **Admin → Plugins → Local Plugin Development** rather than treating an attached folder as an installed plugin.
2. Open the app from the sidebar/App Store if the manifest exposes a UI.
3. Use fake/demo data for the first run.
4. Ask Sero for a small, reversible action before relying on the plugin in real work.

Activate the plugin, complete Spotify OAuth with a test/personal account you are comfortable using, then open the Spotify app.

## Surfaces from the manifest/source

| Surface | Source-checked detail |
| --- | --- |
| Package | `@sero-ai/plugin-spotify` |
| Status | external/local |
| Source checked | `../plugins/sero-spotify-plugin/package.json, README` |
| App state | Manifest declares plugin-owned state under `.sero/apps/<app-id>/...` when an app is present. |

## Privacy, secrets, and recovery

Spotify auth and playback data are account data. README notes Widevine/Castlabs and VMP signing requirements for playback; follow project setup docs before filing playback bugs.

If setup fails, confirm the plugin is active in the current profile, check required host capabilities, restart Sero, and collect redacted logs only. Do not include tokens, account identifiers, email content, banking data, health data, or private workspace paths in support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [App Store, Favorites, and Installed Plugins](/guide/app-store-favorites)
- [Security / Privacy](/reference/security-privacy)
