# Sero Admin App - Task Plan

## Goal
Create a "Sero Admin" app that allows viewing/editing config files, viewing logs, and browsing session data with profile awareness. Uses @sero/ui, emerald-green and indigo colors, view transitions like humanizer.

## Key Data Sources
- **Config files**: `settings.json`, `auth.json`, `layout.json`, `workspaces.json`, `.env` — all under `~/.sero-ui/agent/` (or active profile path)
- **Profiles**: `~/.sero-ui/profiles.json` — cross-profile registry
- **Logs**: `/tmp/sero-electron.log`, `/tmp/sero-vite.log`, `/tmp/sero-remote-*.log`
- **Sessions**: `~/.sero-ui/agent/sessions/*.jsonl` — JSONL files, can be 500KB+

## Architecture
- **Global-scoped** app (no workspace dependency)
- Pi extension: tool for listing/reading config files, sessions, logs
- Web UI: tabbed interface (Config | Logs | Sessions)
- Session viewer: virtualized rendering for large JSONL files (line-by-line lazy load)

## Phases

### Phase 1: Package scaffolding [complete]
- Create `packages/pi-admin-extension/`
- package.json, vite.config.ts, tsconfig, styles.css, index.html
- shared/types.ts
- Port: 5193

### Phase 2: Pi Extension [complete]
- Tool: `admin` with actions: list-configs, read-config, list-sessions, read-log
- Commands: `/admin`

### Phase 3: Web UI - Shell [complete]
- AdminApp.tsx with tabs (Config, Logs, Sessions)
- Header component with profile selector
- View transitions

### Phase 4: Config Editor [complete]
- List config files
- JSON editor with syntax highlighting
- Save capability

### Phase 5: Log Viewer [complete]
- List available logs
- Tail-style viewer with auto-refresh

### Phase 6: Session Browser [complete]
- List sessions with metadata
- Virtualized message list for large sessions
- Message detail view

### Phase 7: Polish & Integration [in_progress]
- Type check
- Build
- Test

## Port Assignment
- devPort: 5193 (next available)
