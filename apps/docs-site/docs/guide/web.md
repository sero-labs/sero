# Web

Sero's Web plugin is a built-in plugin for bringing web context into an agent
session. It can search the web, fetch readable content from sources you provide,
retrieve previously stored search/fetch content, run code-oriented web lookups,
and keep workspace-scoped bookmarks and activity for later review.

Sero is still a **source-only OSS alpha**. Web access depends on configured
providers, local runtime support, signed-in browser/profile state for some
paths, and third-party services that can change outside Sero.

## What the Web plugin does

The Web plugin focuses on a few practical workflows:

- **Search** — ask the agent to search the web with `web_search` or the
  `/web_search` slash command.
- **Fetch and extract** — ask the agent to fetch readable content from one or
  more sources with `fetch_content`.
- **Retrieve stored content** — ask for full content that was previously stored
  by search or fetch with `get_search_content`.
- **Code search** — ask developer-oriented library, API, documentation, or
  debugging questions with `code_search`.
- **Bookmarks and history** — save and manage workspace-scoped bookmarks and
  search/fetch history with `web_bookmark` or `/web_bookmark`.
- **Web app and widget** — browse recent activity, bookmarks, downloads, and
  provider status from the Web app or compact Web Activity widget when visible.

These features are provider-mediated. Do not treat Web as a guaranteed plain
search engine or universal file extractor.

## Search with `web_search`

Use `web_search` when you want current or external information brought into the
agent workflow. The tool returns an AI-synthesized answer with source citations.
Depending on the provider response and runtime behavior, some source content may
also be included or fetched in the background.

Example prompts:

```text
Use web_search to find the current docs for Rspress sidebar configuration.

/web_search search for recent Sero plugin docs and summarize the relevant setup steps
```

`web_search` supports multiple related queries. For broader research, it can be
useful to ask for a few varied searches instead of one narrow query:

```text
Use web_search with 2-4 varied queries about Electron context isolation best practices.
```

Search results are added to the session and mirrored into the Web app's
workspace state so they can be revisited later.

## Fetch and extract content with `fetch_content`

Use `fetch_content` when you already have a URL or source and want the agent to
read it directly. The source code includes support paths for pages/URLs, PDFs,
GitHub repositories or content, YouTube video transcripts, video-related paths,
local video files, and readable markdown extraction from pages.

Those paths are not a promise that every source will extract cleanly. PDFs,
GitHub, YouTube/video, and local-video extraction can depend on provider access,
runtime dependencies, source availability, and the format of the content itself.
Gemini-backed extraction may be used for some fallbacks, so Gemini access can
matter for those cases.

Example prompts:

```text
Use fetch_content to read https://example.com/docs/guide and summarize the setup section.

Fetch these three URLs with fetch_content and compare the installation steps.
```

For a single URL, returned content may be truncated for the chat response. If the
full content was stored, use `get_search_content` to retrieve it by the saved
response details.

## Retrieve stored content with `get_search_content`

`get_search_content` retrieves content that was previously stored by
`web_search` or `fetch_content`. It does not fetch arbitrary new URLs on its own.
It needs the saved response identifier plus either the query/query index or the
URL/URL index from the earlier result.

Use it when the agent says content was stored but the chat response only showed a
summary or truncated excerpt:

```text
Use get_search_content to retrieve the full stored content for the second URL from that fetch result.
```

If there is no stored result for the requested response, ask the agent to run
`fetch_content` again on the source.

## Code-oriented web lookup with `code_search`

`code_search` is for developer questions where examples, API docs, snippets, or
implementation context are more useful than a broad web answer. It is a limited
code-context lookup tool, not a replacement for `web_search`.

Example prompts:

```text
Use code_search to find examples of Rspress defineConfig sidebar setup.

Use code_search for current TanStack Query mutation examples and summarize the API shape.
```

Provider behavior for code search should still be treated as alpha. Verify any
code examples against the upstream project before applying them.

## Bookmarks and history

Use `web_bookmark` or `/web_bookmark` to manage Web plugin bookmarks and related
history for the current workspace.

Examples:

```text
/web_bookmark save the first source from the last web search as a bookmark

Use web_bookmark to list my bookmarks for this workspace.

Use web_bookmark to remove the obsolete Rspress migration bookmark.
```

Bookmarks are **workspace-scoped**, not global. They are stored with the current
workspace's Web state, so a bookmark saved in one workspace should not be
assumed to appear in another workspace.

The bookmark tool also manages search/fetch history. Clearing history removes
stored search/fetch activity for the workspace and can clear runtime memory for
the current session, so use it intentionally.

## Web app and Web Activity widget

The Web app provides a visual place to revisit Web plugin state. The current
source-supported surfaces are:

- **History** — recent searches and fetches
- **Bookmarks** — saved Web plugin bookmarks
- **Downloads** — visible downloaded items when present

The Web Activity widget is a compact dashboard summary. It can show counts for
searches, fetches, bookmarks, and downloads, provider availability dots, and a
small list of recent activity.

Exact app layout and widget placement may change during alpha. Treat the app and
widget as browsing surfaces for Web plugin state, while the tools remain the
agent-facing way to perform search, fetch, code search, and bookmark actions.

## Provider prerequisites

Sero does **not** bundle third-party provider credentials. Search and some
extraction paths depend on what is configured or signed in for the active
profile/session.

Provider paths currently include:

- **Exa** — can use an API key or an MCP fallback; API-key use may also respect
  a monthly request budget.
- **Perplexity** — requires `PERPLEXITY_API_KEY` or `perplexityApiKey` in the
  Web config file.
- **Gemini API** — requires `GEMINI_API_KEY` or `geminiApiKey` in the Web config
  file.
- **Gemini Web** — requires signed-in Chromium cookies for a supported Google
  account in the active profile.

The Web plugin's provider order for `web_search` is Exa, then Perplexity, then
Gemini API, then Gemini Web. Availability can change if credentials expire,
provider limits are reached, browser sign-in state changes, or a third-party
service changes behavior.

For Gemini Web troubleshooting, the support command `google-account` can report
which Google account appears active. It is a support aid only; it does not make
Gemini available by itself.

## Where Web state lives

Web plugin state is stored under the current workspace:

```text
<workspace>/.sero/apps/web/state.json
```

That state can include search/fetch entries, bookmarks, downloads, provider
availability, active provider information, workflow data, and timestamps. Search
and fetch results are also appended to session entries and mirrored into this
state file.

Because this is workspace state, avoid assuming bookmarks, history, downloads,
or provider status are global across every workspace or profile.

## Privacy and safety

Web access can send your query, fetched URLs, and relevant page/source content to
the configured provider or model handling the request. Treat web activity as
sensitive local workspace state.

Practical safety habits:

- Do not search for or fetch secrets, private tokens, customer data, or internal
  URLs unless you understand which provider will receive the request.
- Review fetched content before relying on it for security, legal, medical,
  financial, or production decisions.
- Redact bookmarks, history, URLs, source excerpts, and provider errors before
  sharing screenshots or support logs.
- Remember that third-party pages can be stale, misleading, hostile, or blocked
  by their owners.

## Troubleshooting and limits

### No provider is available

Check that at least one provider path is configured: Exa, Perplexity, Gemini
API, or Gemini Web. API-backed providers need credentials. Gemini Web needs the
right signed-in browser/profile state. Sero does not include default credentials.

### Search works but content is missing

A `web_search` answer can include citations without full inline source content.
Ask the agent to use `fetch_content` on the cited source, or use
`get_search_content` if the tool stored content for that response.

### Fetch returns a short or partial result

Single-source fetch output can be truncated in chat. Ask for stored full content
with `get_search_content`. If no stored full content exists, rerun
`fetch_content` and narrow the source or section.

### PDFs, GitHub, YouTube, or video sources fail

These are source-supported paths, not guaranteed universal extraction. Failures
can come from provider access, format differences, missing transcripts,
rate-limits, blocked content, local runtime dependencies, or Gemini availability
for fallback extraction.

### Bookmarks are missing in another workspace

Bookmarks live in the current workspace's `.sero/apps/web/state.json`. Switch
back to the workspace where the bookmark was saved, or save a separate bookmark
in the new workspace.

### Gemini account confusion

If Gemini Web is expected to work, use the `google-account` support command to
check the active account reported from the profile. Then confirm the profile is
signed in and has the cookies needed for Gemini Web-backed behavior.

### Provider behavior changed

Web providers are third-party services. Results, rate limits, auth requirements,
content access, and extraction behavior can change without a Sero release. When
in doubt, retry with another provider path or fetch the specific source directly.
