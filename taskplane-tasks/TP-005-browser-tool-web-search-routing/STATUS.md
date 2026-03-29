# TP-005: Clarify Browser Tool Usage and Expose Web Tool Slash Commands — Status

**Current Step:** Step 0
**Status:** 🔵 Ready
**Last Updated:** 2026-03-29
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

> **Hydration:** Checkboxes represent meaningful outcomes, not individual code
> changes. Workers expand steps when runtime discoveries warrant it — aim for
> 2-5 outcome-level items per step, not exhaustive implementation scripts.

---

### Step 0: Preflight
**Status:** ⏳ Pending

- [ ] Confirm exactly where the current prompt/tool descriptions make the browser tool look suitable for ordinary web search or downloads
- [ ] Confirm how ChatPanel slash commands are populated today and why the web-plugin tools are not currently visible there
- [ ] Choose the cleanest implementation path that gives users `/web_search` and `/web_bookmark` without regressing the agent toward command aliases instead of tool calls

---

### Step 1: Clarify browser-tool intent and default web-tool routing
**Status:** ⏳ Pending

- [ ] Update the container system prompt and browser tool descriptions so `browser` is explicitly framed as Playwright-driven headless Chromium for UI/browser automation and visual verification inside the container
- [ ] Make ordinary web search, page retrieval, and file/content fetching default to the web-plugin tools (`web_search`, `fetch_content`, and related web tools) instead of the browser tool
- [ ] Preserve the current browser-tool verification workflow for UI testing, screenshots, and interactive page checks
- [ ] Run targeted token/prompt tests

---

### Step 2: Expose supported web slash commands in ChatPanel
**Status:** ⏳ Pending

- [ ] Make the ChatPanel slash-command data path expose at least `/web_search` and `/web_bookmark` for user invocation in the prompt area
- [ ] Ensure those slash commands execute through an intentional supported path rather than becoming a confusing fallback that the agent prefers over the underlying tool calls during normal autonomous turns
- [ ] Keep any plugin manifest or bridge-policy changes narrow and scoped to the supported behavior
- [ ] Add regression coverage for slash-command availability and any bridge-policy changes
- [ ] Run targeted bridge/slash-command tests

---

### Step 3: Testing & Verification
**Status:** ⏳ Pending

- [ ] Repo-wide typecheck passing
- [ ] Desktop test suite passing
- [ ] All failures fixed
- [ ] Build passes

---

### Step 4: Documentation & Delivery
**Status:** ⏳ Pending

- [ ] `docs/plugins-technical.md` updated only if the plugin manifest or command/bridge contract changed
- [ ] Final browser-vs-web-tool routing rule and slash-command behavior summarized in handoff
- [ ] Follow-up UX/tool-selection gaps logged in `taskplane-tasks/CONTEXT.md` if needed

---

## Reviews

| # | Type | Step | Verdict | File |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-29 | Task staged | PROMPT.md and STATUS.md created |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
