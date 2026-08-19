# Spotify Plugin

> Status: **Deprecated**. The current plugin repository marks this plugin as deprecated. It is not recommended for new use.

The Spotify plugin route stays available for users who find old setup links. The former plugin used Spotify OAuth with PKCE for account access and used Spotify's Web Playback SDK for playback.

## Current compatibility

Current Sero builds use stock Electron. The deprecated plugin depended on a Castlabs Electron build, Widevine CDM, and VMP signing for DRM playback. No current supported install or playback path is verified.

Do not install this plugin for a new setup. If you maintain an old checkout, treat its Spotify credentials and tokens as account secrets. Do not include them in logs or support reports.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Security / Privacy](/reference/security-privacy)
