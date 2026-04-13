# Facts — plugins/sero-web-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-web-plugin/` is Sero’s broad web-ingestion plugin: it registers search, fetch, code-search, and bookmark/history tools; persists a workspace-scoped web activity state file; and renders both a full app and a dashboard widget for history, bookmarks, downloads, and provider availability. The extension also owns provider-specific fallbacks for Exa, Perplexity, Gemini API/Web, GitHub repository extraction, YouTube/video analysis, PDF extraction, and Chromium cookie access for Gemini Web.

## Shape & metrics
- Total files: 46
- Largest file: `plugins/sero-web-plugin/extension/gemini-web.ts` (483 LOC)
- Files over 500 LOC: none, but several extraction/provider modules are already close to the cap (`gemini-web.ts`, `video-extract.ts`, `gemini-search.ts`, `youtube-extract.ts`, `rsc-extract.ts`)
- External dependencies of note: `better-sqlite3`, `unpdf`, `@mozilla/readability`, `linkedom`, `turndown`, `p-limit`
- Upstream callers: Pi session resource loading registers `web_search`, `fetch_content`, `get_search_content`, `code_search`, and `web_bookmark`; Sero plugin discovery loads both `WebApp` and `WebWidget`
- Downstream dependencies: workspace-scoped `.sero/apps/web/state.json`, config/usage files under `SERO_HOME/apps/web/` (with a current legacy fallback to `~/.pi`), workspace `Downloads/`, Chromium cookie stores + Keychain/secret-tool, GitHub clone cache under `/tmp/pi-github-repos`, external Exa/Perplexity/Gemini services

## Architectural notes
- The extension is the real owner of search/fetch/bookmark logic, provider selection, and state-file synchronization; the React UI is supposed to be a view over that state.
- The current UI violates that ownership boundary in several places: history clearing, bookmark add/remove, and download deletion all mutate app state directly instead of routing through extension-owned actions.
- `state-sync.ts` serializes writes per file path, but its read path currently fails open and returns defaults for any parse/read error.
- Provider/config loading is duplicated across multiple files (`exa.ts`, `perplexity.ts`, `gemini-api.ts`, `gemini-web.ts`, `github-extract.ts`, `video-extract.ts`, `youtube-extract.ts`) with local `cachedConfig` stacks.
- Production remote config is correct: `vite.config.ts` uses `base: './'` in production.
- The package-local `typecheck` script covers only `ui/tsconfig.json`; extension and shared modules do not have their own package-local typecheck target.

## Runtime-sensitive surfaces
- Profile/config path resolution is critical: `extension/paths.ts` currently falls back to `~/.pi`, which can split Sero profile data/config away from `SERO_HOME` if the env bridge is absent.
- `state-sync.ts` is a data-safety seam for history, bookmarks, downloads, provider availability, and `historyClearedAt`; malformed JSON must not be treated as first-run state.
- The UI’s clear/bookmark/download actions must stay aligned with extension-owned runtime caches and background fetch behavior.
- Native/runtime packaging matters here more than in most plugins: `better-sqlite3`, Chromium cookie access, `ffmpeg` / `ffprobe` / `yt-dlp`, and PDF extraction are all operational dependencies.
- Workspace downloads and file deletion are runtime-sensitive because the UI opens/reveals/deletes real workspace files.

## Surprising discoveries
- The package still has a Sero-incompatible `~/.pi` fallback in `extension/paths.ts`, and every provider/config loader inherits it.
- `ui/components/SearchHistory.tsx`, `BookmarkList.tsx`, and `DownloadsList.tsx` mutate shared state directly instead of calling the extension paths that actually own history/bookmark/download semantics.
- `state-sync.ts` repeats the same fail-open JSON pattern already identified elsewhere in the codebase: malformed `state.json` is treated as a fresh default state.
- There are no package-local tests at all, even though this plugin owns native-module access, external provider fallbacks, and user-visible file mutations.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 52 in the current TS/JS scan
- Largest file: `plugins/sero-web-plugin/extension/gemini-web.ts` (483 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged in the host-bridge/UI mutation seams; D1 only touched persisted-state integrity

### What changed
- `extension/state-sync.ts` now defaults only on missing workspace state files and throws on malformed/unreadable JSON.
- Mutation/update paths now fail closed instead of silently recreating empty bookmarks/history/download state.
- Targeted extension compilation still passes for the touched state-sync module, and monorepo `pnpm typecheck` remains green.

### Still outstanding
- The remaining High items are still the `SERO_HOME`/`~/.pi` path drift and UI mutation ownership drift.
- Medium package-local test/typecheck expansion and provider-module splitting remain pending.
