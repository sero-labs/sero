# Context for: detailed Web provider setup matrix

## Relevant Files
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — explicitly marks the detailed Web provider matrix as deferred/product-gated and calls out runtime testing still needed for provider setup, failure paths, and fetch examples.
- `apps/docs-site/docs/guide/web-access.md` — current public-facing Web overview; confirms feature scope, provider order, state location, privacy/troubleshooting language, and cautions against overclaiming.
- `apps/docs-site/docs/reference/security-privacy.md` — redaction/sensitive-path guidance for auth, profile, logs, and remote surfaces.
- `apps/docs-site/docs/reference/state-and-folders.md` — canonical storage paths for web app state, profile config, and redaction targets.
- `plugins/sero-web-plugin/package.json` — confirms the built-in web app id, state file path, widget surface, and plugin tags/dependencies.
- `plugins/sero-web-plugin/extension/index.ts` — registers tools/commands and writes provider availability into state.
- `plugins/sero-web-plugin/extension/tools-search.ts` — `web_search` contract, provider order, multi-query support, and stored-output behavior.
- `plugins/sero-web-plugin/extension/tools-fetch.ts` — `fetch_content` / `get_search_content` contract, truncation, download sync, and retrieval semantics.
- `plugins/sero-web-plugin/extension/extract.ts` — source-supported extraction routing and fallback ladder.
- `plugins/sero-web-plugin/extension/exa.ts` — Exa auth/budget behavior and MCP fallback.
- `plugins/sero-web-plugin/extension/perplexity.ts` — Perplexity auth requirements and rate limiting.
- `plugins/sero-web-plugin/extension/gemini-api.ts` — Gemini API key usage and video-query helper.
- `plugins/sero-web-plugin/extension/gemini-web.ts` — Gemini Web cookie/sign-in requirements and account detection support command.
- `plugins/sero-web-plugin/extension/state-sync.ts` — workspace state path resolution and persistence shape.
- `plugins/sero-web-plugin/shared/types.ts` — UI/state types for entries, bookmarks, downloads, and provider availability.
- `plugins/sero-web-plugin/ui/WebApp.tsx` and `plugins/sero-web-plugin/ui/widgets/WebWidget.tsx` — public UI surfaces that expose history/bookmarks/downloads and provider dots.

## Confirmed provider/integration facts
- Web search provider order is source-confirmed in code and docs: Exa → Perplexity → Gemini API → Gemini Web.
- Exa:
  - Can use an API key from `EXA_API_KEY` or `apps/web/web-search.json` (`exaApiKey`).
  - If no API key is present, search falls back to an MCP path (`exa-mcp.ts`).
  - API-key mode tracks monthly usage in `exa-usage.json` and hard-stops at 1000 requests/month, with a warning near 800.
- Perplexity:
  - Requires `PERPLEXITY_API_KEY` or `perplexityApiKey` in `web-search.json`.
  - Has a local client-side rate limit of 10 requests per minute.
- Gemini API:
  - Requires `GEMINI_API_KEY` or `geminiApiKey` in `web-search.json`.
  - The code also uses it for video analysis / upload flows.
- Gemini Web:
  - Requires Chromium cookies `__Secure-1PSID` and `__Secure-1PSIDTS` from a supported browser profile.
  - `google-account` support command can report the active Google account, but does not enable Gemini by itself.
- Other source-confirmed integrations:
  - GitHub extraction, YouTube transcript/frame extraction, local video extraction, HTTP extraction, Jina Reader fallback, Gemini-backed URL-context extraction, and bookmark/history/download persistence.

## Credential/config paths and redaction caveats
- Web provider config file: `<SERO_HOME>/apps/web/web-search.json`.
  - Legacy fallback exists at `~/.pi/web-search.json` in code paths, but docs should prefer the current profile-scoped path.
- Exa usage file: `<SERO_HOME>/apps/web/exa-usage.json` (legacy read fallback also exists).
- Web app state: `<workspace>/.sero/apps/web/state.json`.
- Sensitive profile/local paths from docs:
  - `<SERO_HOME>/agent/auth.json`
  - `<SERO_HOME>/agent/.env`
  - `<SERO_HOME>/agent/layout.json`
  - `<SERO_HOME>/agent/workspaces.json`
  - `<SERO_HOME>/agent/github-auth.json`
  - `<SERO_HOME>/agent/gateway-token`
  - `<SERO_HOME>/agent/gateway-config.json`
  - `<SERO_HOME>/agent/gateway-web-tokens.json`
  - memory files under `<SERO_HOME>/workspaces/global/`
  - app state under `<SERO_HOME>/apps/` or `<workspace>/.sero/apps/`
- Redaction advice from docs: do not share raw keys, OAuth tokens, private local paths, prompts, workflow details, or provider errors without redacting.

## Fetch/extraction capabilities and limits confirmed in source
- `fetch_content` supports:
  - standard URLs / readable page extraction
  - multiple URLs in one call
  - GitHub repos/content
  - YouTube video transcripts
  - local video files
  - PDFs
  - frame extraction by timestamp or frame count for YouTube/local video
- Source-confirmed fallback ladder for plain web extraction:
  1. HTTP extraction
  2. Jina Reader fallback
  3. Gemini URL-context extraction
  4. Gemini Web fallback
- Source-confirmed limits / caveats:
  - `web_search` can include inline content, but only when provider output already contains it or background fetch succeeds; otherwise results are citations + synthesized answer.
  - Single-URL `fetch_content` inline output is truncated to 30,000 characters in the tool response.
  - `get_search_content` only retrieves previously stored content by `responseId` plus query/url selector; it does not fetch fresh URLs.
  - Video-only frame extraction is not general-purpose web page support; timestamp/frame logic is restricted to YouTube and local video files.
  - GitHub/PDF/YouTube/video extraction are supported paths, not guaranteed universal extraction; failures can come from provider access, content format, or runtime dependencies.

## What is source-confirmed vs runtime-test-needed
### Source-confirmed now
- Provider order and auth/config variable names.
- Workspace state location and provider status persistence.
- Truncation behavior for single fetches.
- Search history/bookmark/download surfaces in app and widget.
- Exa monthly budget logic and Perplexity client-side rate limit.
- Gemini Web cookie requirements and support command existence.

### Still runtime-test-needed before publishing a provider matrix
- Actual sign-in success rates for Gemini Web across supported Chromium profiles.
- Whether Exa MCP fallback is consistently available in all user environments.
- Real-world PDF/GitHub/YouTube/video extraction edge cases.
- Whether Gemini fallback is actually used for specific extraction cases in practice.
- How provider errors appear to users across auth failure, quota exhaustion, and blocked-content cases.
- Whether provider ordering always behaves as expected when credentials expire or multiple providers are available.

## Failure modes and user-facing troubleshooting candidates
- No provider available: docs already suggest checking Exa / Perplexity / Gemini API / Gemini Web configuration.
- Search works but content is missing: fetch the cited source directly or use `get_search_content` for stored content.
- Single fetch is too long: instruct users to retrieve stored content by `responseId`.
- PDFs / GitHub / YouTube / local video fail: likely provider access, missing transcripts, format differences, or runtime dependency issues.
- Gemini Web confusion: use `google-account` to check the active account and confirm Chromium sign-in state.
- History/bookmarks missing in another workspace: they are workspace-scoped state, not global.
- Malformed state/config files: `state-sync.ts` throws explicit unreadable-file errors and suggests repairing/removing the file.

## Support/product questions before publishing a provider matrix
- Which providers should be publicly named as supported vs just source-detected?
- Should Gemini Web be presented as alpha/support-aid only, not as a reliable configured provider?
- Can the docs mention the legacy `~/.pi/web-search.json` fallback or only the profile-scoped path?
- Should Exa MCP fallback be documented as a support path, or only as an implementation detail?
- What wording is approved for quotas/pricing so we do not imply exact limits or reliability guarantees?
- Should the matrix explicitly say browser login success is runtime-dependent and not guaranteed?
- Do we need product approval before mentioning GitHub/PDF/YouTube/video extraction in a public setup matrix?

## What not to claim
- Do not claim provider availability, reliability, or completion rate beyond the current source-confirmed behavior.
- Do not claim exact quotas/pricing beyond the Exa monthly code limit and Perplexity client-side rate limit.
- Do not claim browser login success for Gemini Web; it depends on supported Chromium cookies and active profile state.
- Do not claim exhaustive provider coverage; the code explicitly supports only the confirmed paths above.
- Do not describe Web as a universal search engine or universal file extractor.
- Do not promise that every search result has inline content or that every fetch will succeed on PDFs/GitHub/video.
