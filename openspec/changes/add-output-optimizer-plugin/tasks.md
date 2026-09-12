## 1. Plugin scaffold and configuration

- [ ] 1.1 Create `plugins/sero-output-optimizer-plugin/` with extension, shared and ui directories and a manifest declaring `pi.extensions` and its required host capabilities. Verify the plugin is discovered and its extension loads into a session.
- [ ] 1.2 Store plugin configuration in the Sero profile state directory rather than under `~/.pi`. Verify a fresh profile resolves output optimisation as disabled.
- [ ] 1.3 Verify a profile with optimisation disabled runs commands as written and receives unmodified results, with no restart needed after disabling.

## 2. Command rewriting

- [ ] 2.1 Resolve verified host/runtime RTK paths, version and state environments over the EventBus. Refresh after install, repair and runtime identity changes. Verify installation that completes after an unavailable response becomes usable without restarting the session.
- [ ] 2.2 Run rewrite probes using the absolute host executable. Bind every inserted RTK invocation to the absolute runtime executable with shell-safe quoting and a per-invocation state environment. Verify paths with spaces, shell startup PATH changes, command-local PATH, compounds and pipelines. Discard rewrites that cannot be bound safely.
- [ ] 2.3 Treat codes 0 and 3 as rewrite candidates, 1 as no rewrite and 2 as upstream deny. Preserve Sero permission checks for every candidate and fallback. Test isolated allow, ask/default and deny configurations; do not assume Git always returns 3. Verify neither supported code grants execution permission.
- [ ] 2.4 Exclude search commands from rewriting, including a search command inside a pipe or a compound. Verify `git status | grep modified` runs unmodified and its raw output is what the compactor receives.
- [ ] 2.5 Exclude `git log`, `git diff` and `git show` from rewriting. Verify each runs unmodified.
- [ ] 2.6 Skip piped rewrites on Windows. Verify the command runs unmodified when a top-level pipe is present.
- [ ] 2.7 Advertise a host capability guaranteeing the reserved run_code_ nested-call prefix at both hooks. Require it in the plugin. Verify nested bash calls skip both interventions, ordinary unprefixed calls remain eligible, and a host without the capability leaves all calls unmodified.
- [ ] 2.8 Record the original and rewritten command per tool call and report both in the result. Verify the result names the command that executed and identifies the requested command.
- [ ] 2.9 Make every rewrite failure path fail open: unavailable, declined, error, timeout, and Windows pipe. Verify each path runs the original command, preserves its exit code, and continues the session.
- [ ] 2.10 Classify every RTK invocation in the candidate and check its per-class switch before execution. Discard the whole rewrite if any affected class is disabled. Verify a compound command cannot bypass a disabled class through another enabled class.
- [ ] 2.11 Apply RTK_DB_PATH, RTK_RECALL_DB and RTK_TEE_DIR from the host/runtime environments to the matching invocations only. Verify tracking and both recovery modes remain within managed session state with existing user configuration, and no concurrent session's environment changes.

## 3. Result compaction

- [ ] 3.1 Consume complete finalized captures using typed host paths, not the incoming truncated tail. Apply ANSI stripping only to eligible unstructured output without changing other characters. Compute a bounded preview and candidate byte counts without retaining a second full candidate. Verify structured streams bypass all content transformations.
- [ ] 3.2 Compact test output from the full capture, keeping failures and summary in the complete candidate. Verify an early failure followed by more than 2,000 removable progress lines survives compaction and appears when the candidate fits the preview.
- [ ] 3.3 Filter build/type-check progress while retaining errors and warnings with file and line in the candidate. Verify protected diagnostics exceeding either preview limit remain complete in the capture, and the bounded preview identifies omissions and recovery paths.
- [ ] 3.4 Aggregate linter diagnostics. Verify the diagnostics are grouped and their counts are retained.
- [ ] 3.5 Compact Git status and log output, keeping every path, commit identifier and full commit message. Verify a status with more than five changed files keeps every path and a long commit message is retained in full.
- [ ] 3.6 Filter package-manager progress. Verify errors survive and the exit code is preserved.
- [ ] 3.7 Group complete search captures without abbreviating paths or matched lines. Keep the raw candidate when grouping would grow it. Verify copied preview anchors resolve, no partial path/match group is presented as an anchor at the preview boundary, and a single oversized match remains fully retrievable from the capture.
- [ ] 3.8 Guard category transformations against removing protected diagnostics and identifiers before presentation. Verify a lossy rule is rejected. Apply the existing payload limits only during preview rendering, recompute candidate preview markers, and verify truncation never changes the source capture or claimed compaction savings.
- [ ] 3.9 Verify unstructured output that matches no category keeps the existing bash preview unchanged, while its complete capture remains available.
- [ ] 3.10 Skip RTK rewriting and all content transformations for requested structured formats. Verify small JSON stdout is the exact payload despite stderr warnings, and oversized JSON has a bounded incomplete preview plus a byte-exact parseable stdout capture. Test both line and byte limits, format flags, non-zero exits and invalid source documents without claiming to repair them.
- [ ] 3.11 Make compaction fail open. Verify a throwing rule, missing capture and incomplete capture preserve received bash content and error status, add no further omissions or dead recovery path, and never rerun a command. Keep accounting records without claiming savings.
- [ ] 3.12 Split compaction rules by category and keep each source file at or below 500 LOC. Verify by checking file lengths.
- [ ] 3.13 Port the category rules from `pi-rtk-optimizer` in structure only, rewrite every lossy rule against the spec, and add the attribution to `NOTICE`. Verify the reference's known losses are covered by regression tests.

## 4. Result reporting and settings

- [ ] 4.1 Add capture-reference and accounting metadata to eligible results, including unchanged calls. Record inputBytes and compactedBytes for complete captures and an unmeasured state otherwise. Add an optimized-result marker only when rewriting or compaction occurred. Verify notices stay separate from payload data and capture reports survive compaction.
- [ ] 4.2 Add the single-command bypass. Verify a command ending with `# no-opt` is neither rewritten nor compacted and later commands remain optimised.
- [ ] 4.3 Build the settings surface: enable, per-class switches, optimisation notices, session savings, RTK status and version, the reason RTK is unavailable (install failed, checksum or version mismatch, container mismatch), and a retry action. Verify each control persists across a restart.
- [ ] 4.4 Mark transformed results and reuse the complete-output viewer for combined output and stream files. Verify a truncated preview is distinguished from full output, all diagnostic details remain reachable from the capture, and structured stdout opens without stderr or notice contamination.

## 5. Metrics

- [ ] 5.1 Measure complete executed-command capture bytes and complete compacted candidate bytes before presentation limits and without notices. Include unchanged and failed-compaction calls with equal counts; exclude incomplete captures and display their count. Verify replay and fork accounting count each history entry once.
- [ ] 5.2 Report plugin compaction only: total removed bytes divided by total measured input bytes. Verify 1000/500 plus 1000/1000 yields 25 percent, zero input shows no percentage, and RTK filtering or Sero truncation is not counted as plugin savings.

## 6. Tests, validation and documentation

- [ ] 6.1 Add unit tests for every compaction rule, every fail-open path, and the nested-call suppression. Verify they pass.
- [ ] 6.2 Build a bench harness over Vitest, Playwright, tsc, the Electron build, ESLint, git status/log/diff and pnpm install, with success and failure variants. Report captured input bytes, complete candidate bytes, preview bytes, estimated tokens and latency separately. Assert diagnostic preservation before presentation and complete recovery after preview truncation.
- [ ] 6.3 Extend the harness to compare the ported rules with the reference implementation and assert the reference's losses do not occur. Verify the comparison runs in CI.
- [ ] 6.4 Verify the approved bounded-preview contract: JSON with stderr warnings, structured documents exceeding each limit, early diagnostics outside the old tail, protected data alone exceeding the preview budget, and paged or local retrieval of complete source data on both runtime backends.
- [ ] 6.5 Document bounded previews and exact readable capture files, including that oversized structured previews need not parse and complete reads may require pagination or local processing. Distinguish plugin compaction from RTK or billing savings and document the # no-opt bypass.
- [ ] 6.6 Run `pnpm typecheck` from the monorepo root. Verify it passes with no errors.
- [ ] 6.7 Verify end-to-end on host and container backends: verified RTK execution, excluded and structured commands unchanged, complete diagnostics recoverable despite bounded previews, exact structured stream files, missing-capture fail-open behavior, ordinary versus nested run_code calls, fork retention, and disabling the plugin restoring baseline behavior.
