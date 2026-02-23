# Spotify App for Sero

Spotify app package for Sero with:

- Spotify Web Playback SDK inside the federated UI
- Playlist browsing and track playback
- Agent tool (`spotify`) for playlist creation, search, and recommendations

## Prerequisites — Widevine DRM

The Spotify Web Playback SDK requires Widevine DRM for audio decryption.
Sero uses the [castlabs Electron fork](https://github.com/castlabs/electron-releases)
which bundles Widevine CDM support. On macOS, the Electron binary must also be
**VMP-signed** with production credentials or Spotify's license server will
reject playback requests.

**One-time setup:**

```bash
# 1. Install the signing tool
pipx install castlabs-evs

# 2. Create a free castlabs EVS account
evs-account signup

# 3. Sign the Electron binary
cd apps/desktop && bash scripts/sign-vmp.sh
```

Re-run `scripts/sign-vmp.sh` after any `pnpm install` that re-downloads the
Electron binary (the signature is on the binary, not in source).

## Setup

1. Create a Spotify app at https://developer.spotify.com/dashboard.
2. Copy your **Client ID**.
3. Add this redirect URI in Spotify app settings:
   - `http://127.0.0.1:5185/spotify-auth-callback.html` (dev)
4. Run from monorepo root:

```bash
pnpm install
pnpm --filter @sero/spotify build
```

5. Sign the Electron binary for DRM (see Prerequisites above).
6. Start Sero desktop dev shell:

```bash
cd apps/desktop
bash scripts/dev.sh
```

7. Open **Spotify** in the sidebar, paste Client ID, connect, and authorize.

## Callback Troubleshooting

If Spotify redirects to `127.0.0.1:5185` and shows `ERR_CONNECTION_REFUSED`, the Spotify remote dev server is not running.

1. Restart Sero dev:
   ```bash
   cd apps/desktop
   bash scripts/dev.sh
   ```
2. Confirm port `5185` is listening:
   ```bash
   lsof -i :5185
   ```

## Agent Tool

Tool name: `spotify`

Actions:

- `connection_status`
- `list_playlists`
- `search_tracks`
- `suggest_songs`
- `create_playlist`
- `add_tracks`
- `start_playlist`
- `pause_playback`
- `next_track`
- `previous_track`

State is global-scoped in `~/.sero-ui/apps/spotify/state.json` (with workspace fallback in Pi CLI mode).
