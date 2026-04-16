# Refactoring Plan — plugins/sero-web-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-web-plugin/` is feature-rich and strategically important, but the current debt sits squarely in truthfulness and boundary ownership. The plugin can silently replace malformed persisted state with defaults, still falls back to a Sero-incompatible `~/.pi` config root, and lets the UI mutate bookmarks/history/download state directly instead of routing through extension-owned behavior. The right outcome is fail-closed state I/O, a profile-scoped path resolver aligned with Sero’s `SERO_HOME` model, explicit UI→extension mutation seams, and enough package-local type/test coverage that the big provider/extractor modules can be safely maintained.

## Issues Found (prioritized)
- **High** — State-file reads fail open and can silently wipe real bookmarks/history/downloads on the next write — `plugins/sero-web-plugin/extension/state-sync.ts:35-47` returns a default state for any read or parse failure, and every mutation path (`plugins/sero-web-plugin/extension/state-sync.ts:61-74,120-240`) then writes that in-memory state back out. In Sero specifically, that means a malformed `.sero/apps/web/state.json` can be interpreted as “first run” and overwritten by the next history sync, bookmark change, or download update. Effort: **S**.
- **High** — The config path resolver still falls back to `~/.pi`, not Sero’s profile-scoped home — `plugins/sero-web-plugin/extension/paths.ts:4-23` returns `join(homedir(), '.pi')` when `SERO_HOME` is absent, and all provider/config loaders inherit that path (`plugins/sero-web-plugin/extension/exa.ts:44-53`, `plugins/sero-web-plugin/extension/perplexity.ts:41-52`, `plugins/sero-web-plugin/extension/gemini-api.ts:14-24`, `plugins/sero-web-plugin/extension/gemini-web.ts:41-60`, `plugins/sero-web-plugin/extension/github-extract.ts:39-54`, `plugins/sero-web-plugin/extension/video-extract.ts:69-86`, `plugins/sero-web-plugin/extension/youtube-extract.ts:46-67`). That violates Sero’s profile-scoped state rules and can split API keys, usage accounting, and provider preferences away from the active profile. Effort: **S**.
- **High** — The UI bypasses extension-owned mutation paths for history, bookmarks, and downloads — `plugins/sero-web-plugin/ui/components/SearchHistory.tsx:20-25`, `plugins/sero-web-plugin/ui/components/BookmarkList.tsx:22-53`, and `plugins/sero-web-plugin/ui/components/DownloadsList.tsx:28-42` call `useAppState()` directly to clear history, add/remove bookmarks, and remove downloads, while the extension already owns the truthful mutation semantics in `plugins/sero-web-plugin/extension/tools-bookmark.ts:27-109` and `plugins/sero-web-plugin/extension/state-sync.ts:120-240`. The UI also re-declares and narrows the host bridge locally in `plugins/sero-web-plugin/ui/lib/host.ts:1-25`. In Sero specifically, this breaks the expected ownership boundary and creates drift between what the UI does, what the extension cache/runtime thinks happened, and what future host-side validation can enforce. Effort: **M**.
- **Medium** — The package-local quality gate covers only the UI and there are no tests for the extension/native/provider paths — `plugins/sero-web-plugin/package.json:12` runs `tsc --noEmit -p ui/tsconfig.json`, and the package contains no `*.test.*` / `*.spec.*` files. That leaves the state-sync layer, provider fallbacks, GitHub clone logic, Chromium cookie extraction, download handling, and bookmark/history behavior unprotected. Effort: **M**.
- **Medium** — Several provider/extractor modules are already near the 500-LOC cap and each mixes multiple responsibilities — `plugins/sero-web-plugin/extension/gemini-web.ts:1-483`, `plugins/sero-web-plugin/extension/video-extract.ts:1-394`, `plugins/sero-web-plugin/extension/gemini-search.ts:1-361`, `plugins/sero-web-plugin/extension/youtube-extract.ts:1-343`, and `plugins/sero-web-plugin/extension/rsc-extract.ts:1-338`. None breach the hard limit yet, but they are already expensive to reason about and will be painful to touch once the next provider/workflow feature lands. Effort: **L**.
- **Low** — Repeated config-loader patterns are still drifting into copy-paste maintenance — `plugins/sero-web-plugin/extension/exa.ts:42-52`, `plugins/sero-web-plugin/extension/perplexity.ts:38-51`, `plugins/sero-web-plugin/extension/gemini-api.ts:11-24`, `plugins/sero-web-plugin/extension/gemini-web.ts:30-60`, and `plugins/sero-web-plugin/extension/github-extract.ts:36-54` still each maintain their own small config-loading stacks. The host-bridge typing half of the original finding is already closed (`ui/lib/host.ts` now imports the canonical `SeroWebHostBridge` from `@sero/common`). Effort: **S**.

## Proposed Refactoring
1. **~~Make `state-sync.ts` fail closed on malformed state.~~ ✅ 2026-04-13 (`336b790a`)**
   - Split the current read path into two explicit behaviors:
     - missing file / `ENOENT` → bootstrap with `DEFAULT_STATE`
     - malformed JSON / permission / partial write → throw a descriptive error
   - Keep the atomic write queue exactly as-is; the problem is truthful reads, not write serialization.
   - Add a narrow helper pair if helpful:
     - `readStateOrDefault()` for true first-run paths
     - `readExistingState()` for mutation/update paths that must not silently erase data
   - This follows the same fail-closed state-file cleanup already documented elsewhere in the deslop log.

2. **~~Replace the `~/.pi` fallback with a profile-scoped Sero resolver.~~ ✅ 2026-04-14 (`a3f625be`)**
   - Introduce one canonical helper for the plugin’s config/usage home rooted in `SERO_HOME`.
   - If Pi-CLI compatibility is still required for standalone use, make it explicit instead of accidental:
     - first resolve `SERO_HOME`
     - optionally support a clearly named standalone fallback path only when Sero env is truly absent and that behavior is intended
   - Because users may already have config under the legacy path, this should be a migration-safe change:
     - dual-read old + new on first access
     - prefer writing only to the canonical profile-scoped location once migrated
   - This aligns with Sero’s profile model (AD-022) and the repo rule against legacy Pi path drift.

3. **~~Route UI mutations through explicit extension/host actions instead of raw state writes.~~ ✅ 2026-04-13 (`ff4e460a`)**
   - Target structure:
     - UI issues explicit app actions for `clearHistory`, `addBookmark`, `removeBookmark`, `deleteDownload`
     - preload / host bridge exposes those actions with canonical types
     - extension/state layer remains the single owner of mutation semantics and persistence
   - Reuse the existing bookmark/history logic in `tools-bookmark.ts` / `state-sync.ts` instead of maintaining a parallel renderer-only mutation path.
   - Replace `ui/lib/host.ts`’s local `HostApi` declaration with the canonical shared bridge types so host drift becomes a typecheck failure instead of a runtime surprise.
   - This aligns with Sero’s “all cross-process layers update together” rule and keeps AD-020 tool ownership intact for agent-facing actions.

4. **~~Add package-local typecheck + tests for the real risk surfaces.~~ ✅ 2026-04-14 (`43572da8`)** _(2026-04-14 partial: package-local UI+focused-extension typecheck plus state/path tests landed across `56ff5e59` and `cd40bbcb`; this E5 pass expanded the extension gate across the provider/extractor seams and added direct helper coverage for Gemini Web, Gemini Search, YouTube URL detection, and RSC parsing.)_
   - Expand package-local typecheck beyond `ui/` to include `extension/` and `shared/`.
   - Add focused tests around:
     - malformed `state.json` does not get silently replaced with defaults
     - config path resolution stays inside the active profile
     - bookmark add/remove retains dedupe behavior
     - UI-triggered clear-history semantics match tool-triggered semantics
     - download delete flow removes both the file entry and persisted state correctly
   - Start with pure module tests; do not block this pass on a heavyweight browser/integration harness.

5. **~~Split the near-cap provider/extractor modules before they cross the hard limit.~~ ✅ 2026-04-14 (`43572da8`)**
   - Suggested first cuts:
     - `gemini-web.ts` → account detection, upload/auth helpers, response parsing
     - `video-extract.ts` → config/path detection, upload/polling, ffmpeg helpers
     - `gemini-search.ts` → provider selection/orchestration vs provider-specific adapters
     - `youtube-extract.ts` → metadata/frame extraction vs fallback summarization
     - `rsc-extract.ts` → chunk parsing, node extraction, table rendering helpers
   - Keep public entrypoints stable while reducing single-file cognitive load.
   - This is a maintainability step, not a rewrite.

6. **Deduplicate config loading once the truthfulness fixes are in.**
   - Add one shared config loader module for `web-search.json` and reuse it across the provider modules.
   - The host-bridge typing seam is already resolved through `@sero/common`; keep the remaining cleanup focused on config-loading duplication only.
   - Land this after the fail-closed/path-owner fixes so the package does not just centralize the wrong behavior.

## Benefits & Trade-offs
- Benefits:
  - Prevents silent loss of bookmarks/history/download state.
  - Restores profile-scoped config behavior that matches Sero’s `SERO_HOME` model.
  - Gives the plugin one truthful owner for user-visible mutations instead of split UI/extension behavior.
  - Makes future provider/extractor work safer by adding package-local type/test coverage and reducing module size pressure.
- Trade-offs:
  - The UI mutation fix touches more than the plugin folder if new preload/host actions are introduced.
  - Fail-closed state reads will surface errors users do not see today; that is correct, but the UX must be explicit.
  - Moving off the legacy path may need a small compatibility window so existing standalone config is not stranded.

## Dependencies & Risks
- The state-sync hardening is a runtime-sensitive behavioral change: malformed state will become noisy instead of silently self-healing.
- The config-path fix may require a migration/dual-read window if anyone already stores `web-search.json` or `exa-usage.json` under `~/.pi`.
- Replacing raw UI state mutations with explicit actions depends on the available host/app bridge. If that bridge is not ready, an interim action wrapper should still centralize mutations inside the plugin rather than keep duplicating them in components.
- Splitting the large provider modules must preserve success-path behavior for Gemini Web auth, Files API upload/delete, GitHub clone/API fallback, Chromium cookie lookup, and workspace download persistence.
- No container image rebuild is required for this plan, but runtime verification should include packaged native dependency behavior (`better-sqlite3`) and real tool availability (`ffmpeg`, `ffprobe`, `yt-dlp`).

## Next Steps
1. If we do a follow-up polish pass, clear the remaining Low config-loader dedupe seams across `exa.ts`, `perplexity.ts`, `gemini-api.ts`, `gemini-web.ts`, and `github-extract.ts`.
2. Otherwise treat this plugin as Medium-complete and move to the next queued E5 target in the desktop/packages/plugins backlog.

Verification checklist:
- A deliberately malformed `.sero/apps/web/state.json` surfaces a recoverable error and is not silently replaced with defaults on the next mutation.
- Provider config, usage accounting, and preferences resolve inside the active profile home, not `~/.pi`, and legacy data (if any) is still discoverable during migration.
- Clearing history from the UI has the same runtime effect as the extension-owned clear-history path, including background fetch suppression and `get_search_content` visibility rules.
- Adding/removing bookmarks from the UI goes through the same dedupe/persistence rules as the extension tool path.
- Download deletion still removes the workspace file when appropriate and leaves persisted state/UI in sync.

## Execution log
- `336b790a` — `fix(plugins): harden persisted state integrity`
- `d885ff2d` — `refactor(contracts): centralize plugin bridge ownership` *(partial for this plan: canonical host-bridge typing only)*
- `ff4e460a` — `fix(plugins): make web and context actions truthful`
- `a3f625be` — `fix(plugins): align profile-scoped path ownership`
- `56ff5e59` — `refactor(plugins): harden E3 bridge ownership and quality gates` *(web: added focused extension compile + package-local tests for path/state/download/bookmark semantics)*
- `cd40bbcb` — `test(web): cover history clearing and download cleanup`
- `43572da8` — `refactor(web): split provider extraction seams`
