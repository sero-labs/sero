# Spotify App for Sero

Spotify app package for Sero with:

- Spotify Web Playback SDK inside the federated UI
- Playlist browsing and track playback
- Agent tool (`spotify`) for playlist creation, search, and recommendations

## Setup

1. Create a Spotify app at https://developer.spotify.com/dashboard.
2. Copy your **Client ID**.
3. Add this redirect URI in Spotify app settings:
   - `http://127.0.0.1:5181/spotify-auth-callback.html` (dev)
4. Run from monorepo root:

```bash
pnpm install
pnpm --filter @sero/spotify build
```

5. Start Sero desktop dev shell:

```bash
cd apps/desktop
bash scripts/dev.sh
```

6. Open **Spotify** in the sidebar, paste Client ID, connect, and authorize.

## Callback Troubleshooting

If Spotify redirects to `127.0.0.1:5181` and shows `ERR_CONNECTION_REFUSED`, the Spotify remote dev server is not running.

1. Restart Sero dev:
   ```bash
   cd apps/desktop
   bash scripts/dev.sh
   ```
2. Confirm port `5181` is listening:
   ```bash
   lsof -i :5181
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
