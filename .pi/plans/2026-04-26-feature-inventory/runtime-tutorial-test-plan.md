# Runtime Test Protocol: Conservative Guides -> Step-by-Step Tutorials

## Goal
Convert the current conservative overview docs into future tutorial-style guides only after the runtime behaviors below are verified with synthetic, low-risk data.

This protocol is planning-only. Do not modify docs-site/source files as part of this pass.

## Scope
Guides in scope:
- `memory`
- `web-access`
- `scheduler-reminders`
- `plugins-and-apps`
- `workspace-and-chat`
- `explorer-workspace`
- `git-manager`
- `web-remote`

## Test environment prerequisites

### Baseline host/profile setup
- macOS Apple Silicon desktop build.
- Fresh or disposable Sero profile.
- No real customer data, secrets, tokens, or private repos.
- Use a synthetic workspace with throwaway content for every flow that mutates state.
- Keep a redaction-safe log/screenshot policy: redact paths, tokens, URLs, commit messages, memory entries, and provider errors.

### Safe synthetic workspace requirements
Create at least one disposable workspace/repo that contains:
- a small Git repo with a few text files, one binary-ish file if needed for preview coverage, and a README
- a known remote only if testing fetch/pull/push behavior in a controlled test repo
- one or two dummy branches and a disposable stash scenario
- a minimal web-preview target or local dev server when Explorer/browser surfaces need it
- synthetic memory notes and scratchpad items only
- synthetic scheduler jobs/reminders only
- non-sensitive plugin install targets only if testing App Store/install flows

### Provider / credential prerequisites
- Web Access tests may require one or more of: Exa API key or MCP fallback, Perplexity API key, Gemini API key, or a Google account signed into Chromium cookies for Gemini Web.
- Web Remote tests require `SERO_GATEWAY=1` and access to the profile-scoped gateway credentials.
- If a prerequisite is missing, mark the test blocked rather than substituting a real credential.

## Test matrix by guide/topic

| Guide / topic | Runtime flow to verify | Suggested commands / workflows | Pass evidence to capture | Blockers / caveats |
| --- | --- | --- | --- | --- |
| Memory | QMD unavailable vs available behavior; memory-context visibility; scratchpad examples; direct read/write/search | `sero memory list`; `sero memory read --target memory`; `sero memory write --target memory --content "Demo preference: ..."`; `sero memory search --query "demo project"`; `/memory list`; `/scratchpad add ...` | Screenshot or log showing memory files read/written, search results, and whether a memory-context block appears in chat | Semantic search may degrade without QMD; memory context block is selective and may not appear every turn |
| Web Access | Provider setup/failure paths; `web_search`; `fetch_content`; `get_search_content`; HTML/PDF/GitHub/video extraction examples; bookmarks/history surfaces | Ask agent to use `web_search` on a harmless public docs query; fetch a public URL; retrieve stored content by response id; test `/web_bookmark`; inspect Web app History/Bookmarks | Provider name used, query, citations, fetch output, stored-content retrieval, and a screenshot of History/Bookmarks/Downloads | Provider access is environment-dependent; PDF/GitHub/video extraction can fail by source/provider; Gemini Web depends on browser sign-in state |
| Scheduler and Reminders | Notification permission behavior; reminder delivery; cron `run`; missed-run recovery; disabled/completed behavior | `/cron status`; `/cron on`; `current_time`; `cron add`; `cron run`; `reminder add`; `reminder snooze`; `reminder complete`; toggle macOS notification permissions if safe | Evidence of scheduler state, notification permission state, reminder/job list, completion/run result, and a desktop notification screenshot or notification log | Delivery is best effort; focus mode and macOS permissions can block notifications; `run` is asynchronous; email reminders are not shipped |
| Plugins and Apps | App Store install/uninstall/update semantics; favorites persistence; unsupported-plugin behavior; widget placement | Open App Store Installed/Discover; install a trusted synthetic/local plugin; star/unstar an app; verify sidebar promotion; uninstall and re-check state; inspect widgets if available | App Store screenshots showing Installed/Discover, favorite state, unsupported-host messaging, and post-uninstall state | No public update workflow may exist; uninstall does not wipe all plugin-created state; source trust and compatibility gates apply |
| Workspace and Chat | Onboarding/profile flow; session create/resume UI; command menu catalog; prompt controls if later documented | Fresh profile launch; create/resume workspace session; switch apps with chat pinned open; `⌘K`/`Ctrl+K` command menu; session search by name/first message | Screenshot of shell layout, onboarding/profile selection, session tree, active chat panel, and command menu | Exact onboarding UI may change during alpha; slash-command catalog is intentionally incomplete in overview docs |
| Explorer Workspace | Workspace/browser/terminal layout; dev-server status; container vs host-mode behavior | Open Explorer in the synthetic workspace; verify sidebar/main/terminal panes; open file preview and terminal; start a known local dev server; check status panel; compare container-backed vs host fallback | Screenshots of file tree, editor/preview, terminal panel, and status-bar dev server entry; note runtime mode | Container-backed mode is preferred; host mode is reduced; browser automation and managed preview parity are container-oriented |
| Git Manager | Status/log/branches/diff/show_commit read flows; safe mutating flows in disposable repo; branch/worktree guardrails | `/git status`; `git_manager refresh`; `git_manager log`; `git_manager branches`; `git_manager diff`; `git_manager show_commit`; in throwaway repo test `stage`, `commit`, `stash`, `checkout`, `merge`, `cherry_pick`, `push` with caution | Terminal output or app screenshots showing branch/status/diff/commit detail; note any guardrail refusal messages | Use disposable repos only; mutating actions affect the real repo immediately; conflicts may require CLI resolution |
| Web Remote | Gateway enablement; pairing/login; session/file/artifact access; token scope/revocation | Launch with `SERO_GATEWAY=1`; confirm gateway port; pair a local browser client; list workspaces/sessions; send a harmless prompt; inspect session history; revoke token | Port check, pairing success, session interaction proof, and revocation proof | Not public-internet safe; token leakage is sensitive; master token is high privilege; platform/network exposure must be controlled |

## Command/workflow verification notes

### Memory
- Prefer direct tool checks for list/read/write/search before any tutorial language is written.
- Verify that the memory context block, if shown, corresponds to the active prompt and does not imply full recall.

### Web Access
- Confirm at least one provider path works end-to-end for search.
- Confirm `fetch_content` can store content and `get_search_content` can retrieve it later.
- If testing provider-specific failure messaging, use deliberate missing credentials or a blocked source only in the disposable profile.

### Scheduler and Reminders
- Verify `/cron status` before and after enabling.
- Use `current_time` for relative scheduling.
- Confirm that job run/reminder fire produces a visible artifact: notification, history row, or status entry.

### Plugins and Apps
- Verify the difference between built-in shell apps, bundled plugin apps, and installed plugins.
- Confirm favorites persist through restart and are reflected in the sidebar only for host-compatible app surfaces.
- Confirm uninstall removes the plugin package but not necessarily all app state.

### Workspace and Chat
- Capture the first-run/profile selection if available.
- Verify session creation, resumption, and searching are understandable before tutorializing them.
- Confirm command menu shortcuts match the current shell on macOS.

### Explorer Workspace
- Use a repo that can safely tolerate file opens, previews, and terminal commands.
- Verify container-backed and host-mode differences only if both modes are available in the test environment.
- If a dev-server panel is part of the future tutorial, verify the app recognizes a real registered server rather than assuming auto-discovery.

### Git Manager
- Use a disposable repo for every write path: commit, branch delete, stash pop/apply, merge, cherry-pick, and push.
- Verify refusal behavior for protected actions when appropriate, then stop and document it.

### Web Remote
- Keep pairing local-only and token-scoped.
- Verify that the gateway is disabled again after testing.
- Never capture raw token material in screenshots.

## Pass / fail evidence to capture

### Pass evidence
- Timestamped screenshot or short screen recording for each verified surface.
- Exact command used and minimal sanitized output.
- Profile/workspace name, runtime mode, and whether the test used synthetic data.
- For provider-dependent flows, the provider path that actually handled the request.
- For failures/guardrails, the exact refusal or warning message.

### Fail evidence
- Repro steps, exact command, and the smallest redacted excerpt that shows the failure.
- Relevant log file path(s), such as:
  - `/tmp/sero-electron.log`
  - `/tmp/sero-vite.log`
  - `/tmp/sero-web-remote-watch.log`
  - `/tmp/sero-remote-<plugin>.log`
- Whether the failure depended on missing credentials, runtime mode, or profile state.

## Known caveats and blocked tests

### Known caveats
- Memory context is selective and may not appear on every turn.
- Web providers are third-party services; results and extraction behavior can change.
- Scheduler notifications are best effort, not guaranteed delivery.
- Plugin/App Store behavior can differ by host compatibility and current build.
- Explorer and Web Remote have runtime-mode differences that may affect screenshots and workflows.
- Git Manager mutations are not sandboxed from the real repository.

### Blocked tests requiring credentials/provider access
- Web Access provider matrix beyond the currently configured provider path(s).
- Gemini Web setup validation without signed-in Chromium cookies.
- Exa MCP fallback validation if no MCP-capable environment is present.
- Perplexity and Gemini API validation without API keys.
- Web Remote pairing if the gateway is not launched with `SERO_GATEWAY=1`.
- Any flow that needs a third-party sign-in, license, or paid quota.

## Mapping from passing tests to future tutorial upgrades

| Passing runtime result | Tutorial upgrade allowed later |
| --- | --- |
| Memory read/write/search works with synthetic notes; memory context visibility is understood | Convert Memory from overview to a step-by-step “save, find, and use memory” tutorial with explicit success/failure examples |
| Web search + fetch + stored-content retrieval works on at least one provider path | Add a tutorial for search, fetch, and revisiting stored results, plus a separate provider setup appendix only for verified providers |
| Scheduler job/reminder creation, notification delivery, and recovery behavior are verified | Add tutorial flows for “set a reminder,” “run a cron job now,” and “recover missed runs” with clear caveats |
| App Store install/uninstall/favorite behavior is verified | Expand Plugins and Apps into a practical install/manage sidebar tutorial, including what changes after restart |
| Workspace creation/resume and command menu navigation are verified | Turn Workspace and Chat into a first-run tutorial with a stable sequence and labeled screenshots |
| Explorer layout, terminals, previews, and dev-server panel are verified | Convert Explorer Workspace into a project setup walkthrough that includes file edits, previewing, and terminal usage |
| Git read-only flows plus safe disposable-repo mutations are verified | Turn Git Manager into a repo walk-through that includes status, commit, branch, and rollback examples |
| Web Remote pairing and scoped access are verified locally | Expand Web Remote into a controlled pairing tutorial with a strict security warning and revocation step |

## Exit criteria for tutorial conversion
A guide may be upgraded from conservative overview to tutorial-style steps only when:
1. The relevant runtime flow has been verified on the current build.
2. Evidence exists for both success and at least one realistic failure/blocked state.
3. The flow can be reproduced with synthetic or disposable data.
4. Any credential or provider dependency is documented as a prerequisite, not assumed.
5. The resulting tutorial can avoid promising unsupported parity, reliability, or security guarantees.
