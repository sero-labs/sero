# Context for: conservative user-facing Web plugin guide

## Relevant Files
- `plugins/sero-web-plugin/extension/index.ts` — plugin entry point. Registers all web tools/commands, handles session lifecycle, persists state sync, and exposes provider availability.
- `plugins/sero-web-plugin/extension/tools-search.ts` — `web_search` tool behavior, provider auto-selection, multi-query support, and what gets returned/stored.
- `plugins/sero-web-plugin/extension/tools-fetch.ts` — `fetch_content` and `get_search_content` tools, single vs multi-URL behavior, truncation rules, and video/GitHub/Gemini caveats.
- `plugins/sero-web-plugin/extension/tools-code-search.ts` — `code_search` tool and its limited contract (query + token cap).
- `plugins/sero-web-plugin/extension/tools-bookmark.ts` — `web_bookmark` tool actions and its workspace/state prerequisites.
- `plugins/sero-web-plugin/extension/state-sync.ts` — on-disk state format, history/bookmark/download persistence, and workspace path resolution.
- `plugins/sero-web-plugin/extension/commands.ts` — user-facing slash commands `/web_search` and `/web_bookmark` and their safe prompt-routing instructions.
- `plugins/sero-web-plugin/shared/types.ts` — canonical UI/state shapes for history, bookmarks, downloads, provider status.
- `plugins/sero-web-plugin/ui/WebApp.tsx` — main UI surface: tabs, stats, and visible sections.
- `plugins/sero-web-plugin/ui/widgets/WebWidget.tsx` — compact dashboard widget showing recent activity and provider dots.

## Tool and Command Names
- Registered tools: `web_search`, `fetch_content`, `get_search_content`, `code_search`, `web_bookmark`.
- Registered slash commands: `web_search`, `web_bookmark`.
- Additional command: `google-account` (shows active Google account for Gemini Web availability).
- `web_search` and `web_bookmark` command handlers only route prompts to the matching tool; they do not do the work directly.

## Provider Prerequisites and Caveats
- `web_search` provider order is documented in code as: Exa, then Perplexity, then Gemini API, then Gemini Web.
- Exa can run either with an API key or via MCP fallback; `isExaAvailable()` also respects a monthly request budget when an API key is present.
- Perplexity requires `PERPLEXITY_API_KEY` or `perplexityApiKey` in the web config file; code errors clearly if absent.
- Gemini API requires `GEMINI_API_KEY` or `geminiApiKey` in the web config file.
- Gemini Web requires signed-in Chromium cookies (`__Secure-1PSID` and `__Secure-1PSIDTS`) and the active Google account may be reported separately.
- `fetch_content` can use Gemini-based extraction as a fallback, but source code explicitly warns that video/Gemini paths depend on Gemini access.
- `extract.ts` only routes frame/timestamp extraction for YouTube and local video files; frame-only extraction is not general-purpose web page support.

## Conservative Capability Notes
- `web_search` returns an AI-synthesized answer plus source citations; with `includeContent` it may also fetch full content asynchronously or inline when already available.
- Multi-query searches are supported; code encourages 2–4 varied queries for broader research.
- `fetch_content` supports URLs, multiple URLs, GitHub repos, YouTube video transcripts, local video files, PDFs, and readable markdown extraction from pages.
- For single-URL fetches, content can be truncated to 30,000 characters and users are directed to `get_search_content` for full retrieval.
- `get_search_content` only retrieves content previously stored by `web_search` or `fetch_content` and requires `responseId` plus `query/queryIndex` or `url/urlIndex`.
- `code_search` is specifically a code-context lookup tool; it calls an Exa-backed MCP tool and returns code snippets/docs, not a broad web search.
- `web_bookmark` manages only bookmarks and search history; `clear_history` wipes search/fetch history and also clears runtime memory in the current session.

## Where State Appears to Live
- Primary workspace state is stored under `.sero/apps/web/state.json` relative to the workspace root.
- Workspace root is inferred by finding `.sero-workspace.json`; state path is resolved from that root.
- State includes entries/history, bookmarks, downloads, provider availability, active provider, workflow, and timestamps.
- The extension also keeps an in-memory runtime cache for search/fetch results during the session, then syncs selected entries to the state file.
- Search/fetch results are appended to a `web-search-results` custom entry in the session branch and mirrored into `state.json`.

## UI and Widget Surfaces
- `WebApp` has three tabs: History, Bookmarks, Downloads.
- The header shows counts for searches, fetches, bookmarks, and visible downloads.
- `WebWidget` is a compact summary: counts for searches/fetches/bookmarks/downloads, provider availability dots, and up to four recent entries.
- The widget distinguishes search vs fetch entries and shows provider badges only for search entries when available.

## Caveats to Avoid Overclaiming
- Do not describe `web_search` as a plain search engine: it is provider-mediated and answer-centric.
- Do not claim `fetch_content` universally extracts arbitrary files; local video, YouTube, GitHub, and HTTP extraction have separate logic and some paths require Gemini access.
- Do not promise every search result has full inline content; inline content only appears when providers return it or when background fetch completes.
- Do not imply bookmarks are global; the source stores them in workspace state tied to the resolved workspace root.
- Do not say provider availability is inferred from the UI alone; it is written into state during session setup.
