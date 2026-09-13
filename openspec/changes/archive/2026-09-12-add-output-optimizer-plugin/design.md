## Context

See `proposal.md` for motivation, and `add-managed-rtk-and-tool-result-capture` for
the pinned RTK and the capture this change consumes. Constraints that shape the
approach:

- Plugin extensions load into every agent session through the resource loader.
  There is no per-session enable, so a plugin's own configuration is the only
  off switch. `filterCompatiblePluginExtensions` gates a plugin by its declared
  host capabilities.
- The Pi tool-call hook receives a deep-cloned argument object. Mutating it
  changes what executes, but not the persisted tool call, and the
  `tool_execution_start` event has already fired with the original arguments.
  The transcript therefore cannot show a rewritten command on its own.
- The Pi tool-result hook may replace the result's `content`, `details`,
  `isError` and `usage`. The result becomes the persisted tool result message.
  `details` is persisted, is replayed to the renderer, and is never serialised
  to a model provider, so it carries UI metadata. It cannot carry the capture
  path the agent must use; the path stays in the model-visible content.
- Shell commands nested inside `run_code` DO reach the extension hooks: the
  run_code tool passes the session agent's `beforeToolCall` and `afterToolCall`
  into the program runner, and the runner invokes them for every nested call.
  The plugin must therefore recognise and skip nested calls. The nested call ID
  carries a stable marker that the code-mode adapter owns.
- RTK 0.49 rewrite codes are permission outcomes: 0 is allow, 3 is
  ask/default, 2 is deny, and 1 is no rewrite. Both 0 and 3 carry a rewrite.
  Sero uses these only to select a candidate command; they never grant or
  bypass Sero execution permission. Code 2 discards the candidate and leaves
  the original subject to Sero's normal permission checks. Host Claude settings
  can affect these codes, so tests isolate that configuration and assert both
  supported outcomes rather than assuming Git always exits 3. See the
  [upstream protocol](https://github.com/rtk-ai/rtk/blob/v0.49.0/src/hooks/rewrite_cmd.rs).

- Measured RTK 0.49 behaviour: `rtk read` is byte-identical to its originals,
  including a 4.3 MB file and a 1 MB lock file. `rtk grep` and `rtk rg`
  abbreviate file paths and truncate matched lines above a small output
  threshold, and RTK rewrites a search command that appears inside a pipe or a
  compound command. `rtk git log` truncates long commit messages, and
  `rtk git diff` and `rtk git show` truncate hunks and additions. `rtk git
  status` keeps full paths.
- Built-in plugins are directories named `plugins/sero-<name>-plugin/`, staged
  into `dist/electron/builtin/plugins`.
- The reference implementation is `pi-rtk-optimizer` (MIT, Copyright (c) 2026
  MasuRii). Its `output-compactor.ts` is 695 lines, so the category rules must
  be split. Its rules are lossy in ways this change's spec forbids: it
  abbreviates search paths and truncates matched lines, drops Git status paths
  above small caps, and truncates commit messages. The rules can be ported in
  structure, but each lossy rule must be rewritten or dropped.

## Goals / Non-Goals

**Goals:**

- Bounded shell-output previews backed by complete captured output. Category
  rules retain every diagnostic before preview truncation.
- Every compaction omission recoverable from the capture without rerunning the
  command. RTK's own filters are outside this contract, which is why the
  measured-loss commands are excluded from rewriting.
- Fails open at each of the two intervention points, independently.

**Non-Goals:**

- No rewriting or compaction of results from tools other than the shell tool,
  and no rewriting or compaction of shell calls nested inside `run_code`.
- No model call anywhere in the path. Compaction is deterministic.
- No retrieval tool. The capture path plus the agent's existing file tools is the
  whole recovery contract.
- No source-code filtering.
- No retry, rescue, or reinterpretation of a command that failed.

## Decisions

### RTK's catalogue decides, with measured losses excluded

Two alternatives were considered. A plugin-side deny-list of command shapes was
rejected once measurement showed the suspected losses were not real: `rtk read`
was byte-identical on every file tested up to 4.3 MB, and `rtk git status` was
faithful. Such a list would have removed useful `head` and `tail` rewrites to
prevent a loss that could not be produced. Trusting RTK for search as well was
rejected because above the size threshold it abbreviates paths and truncates
matched lines, which breaks the grep-then-edit loop and contradicts the
requirement to preserve file paths. Measurements also show that RTK truncates
commit messages in `git log` and hunks in `git diff` and `git show`.

So RTK owns the catalogue except for two measured-loss groups: search commands,
and the lossy Git history and diff forms. Each exclusion is based on a measured
contradiction rather than on a precaution.

### Search exclusion covers pipes and compounds

RTK rewrites a search command that appears inside a pipe or a compound, even
when the top-level command is not a search: `rtk rewrite "git status | grep
modified"` returns `git status | rtk grep modified`. A top-level shape check
cannot prevent that. Before rewriting, the plugin scans the command's
top-level segments for `grep`, `rg` or `find`. If any segment is a search
command, the plugin does not rewrite the command at all. A conservative match
that skips a rewrite is safe; the command runs as written.

### Windows piped rewrites are skipped in this change

The reference implementation carries a Windows-only pipeline fixup: a rewritten
`rtk` producer in a pipe must be buffered so the pipeline sees its full output
and exit status. Porting that fixup is a separate piece of work. Until it
lands, the plugin does not rewrite a command that contains a top-level pipe on
Windows. This keeps pipeline semantics correct and fails open on the platform.

### Search grouping is implemented in the plugin

The plugin receives unmodified search output and groups it by file itself.
Grouping is the one transformation that can reduce size without touching a path
or a matched line: the file path is printed once per file instead of once per
match. It does not always reduce size. When it does not, the complete candidate
remains the raw output and only bounded presentation can omit content. The reference implementation's grouping abbreviates paths,
truncates lines, and caps matches; none of that is ported.

All result-compaction categories are implemented in the plugin. RTK owns
command rewriting. Search grouping stays small and is guarded by tests that copy a path and a matched line out
of grouped output and assert that an edit resolves.

### Complete output travels through the capture, not `details`

Putting complete output in the result's `details` field was rejected because it
is persisted in the session file: a multi-megabyte result would inflate the
session JSONL and slow every session open, and retention could not be tested.
The bytes live in the capture from `add-managed-rtk-and-tool-result-capture`. Compaction
requires finalized, readable capture metadata. If capture failed or cannot be
read, preserve the received bash payload, existing reports and error status;
never compact its truncated tail or rerun a rewritten command. Add the separate
requested/executed command report if rewriting occurred, even on this failure
path. Accounting metadata can record the skip without claiming savings. The
model-visible result keeps the capture path and size from the bash tool, and the
compactor must keep that report. The plugin adds its structured metrics to
`details` for the UI.

### Complete input, bounded presentation

The user selected bounded previews with complete readable capture files. Read
finalized capture data through the host paths in typed metadata, never the
truncated tool text or a container-only path. Apply category rules to the
complete captured output, then construct a preview under the existing 50 KB /
2,000-line payload limits. Process input incrementally where possible and keep
only the preview window plus rule state and byte counts. Do not retain or
persist a second complete candidate solely to produce a preview or metrics.
A rule that cannot process an input safely fails open to the existing bash
result. An unrecognized category also keeps that result unchanged.

Diagnostic preservation applies to category transformations before preview
truncation. Protected content that does not fit remains in the original capture;
the preview says that it omits content and points to the complete files. For
search output, emit only complete path/match groups as edit anchors within the
preview budget. If one matched line cannot fit, omit that anchor and point to
the raw capture instead of emitting a shortened anchor. Recompute preview markers
for the candidate; do not reuse line counts from the original bash tail.
Exit status and capture reports remain outside the payload budget.

### Exact structured streams with separate notices

Before rewriting, recognize requested machine-readable formats from the parsed
command and format flags, including structured test reporters, Git formats and
search JSON. These commands bypass both RTK rewriting and content compaction;
there is no format-changing fallback. Treat ambiguous classification
conservatively by declining transformation. Use the complete stdout capture as
the source of the preview and report stderr separately. A small stdout payload
is unchanged and parseable if the original was valid. An oversized payload is
only a marked preview; the byte-exact stdout file is the authoritative document.
Never append capture notices, exit text or stderr to the structured payload.
Never strip ANSI or whitespace from a stream merely because it looks like
terminal output. Invalid source documents remain invalid and are not repaired.

The complete combined and stream files share the prerequisite's references,
mounts and cleanup. Opening a file does not promise an unlimited read-tool
response. Large documents can be processed locally or retrieved in pages.
This boundary also keeps capture bytes out of session JSONL except for the
bounded preview that the model actually receives.

### A dedicated viewer rather than the editor

A capture lives outside every workspace on purpose, so no file watcher, search
or language server sees it. The editor path resolver enforces that boundary: a
path outside the workspace roots is rejected, including through a symlink.
Opening a capture in the editor would require weakening a deliberate guard.

The viewer gets its own read contract instead, confined to the capture root. Do
not copy or link captures into a workspace to make them reachable: that would
duplicate large files and reintroduce the watcher noise the layout avoids. Do not
relax the editor's path policy for this feature.

The inline preview is capped. It exists for a quick look, not as the reading
surface, and the tool call must not accumulate an unbounded log while the user
pages through a large file. The complete file stays one action away.

### A recorded rewrite instead of a hidden one

Because a tool-call mutation does not reach the persisted tool call, the
plugin remembers the original and the rewritten command per tool call and
reports both in the result. The persisted call keeps the requested command, so
the result must identify the command that executed and the transcript must
present the two as requested and executed. This reporting is independent of
compaction and must survive a missing capture or a throwing compaction rule.
Without this the reader cannot tell what ran.

### Per-class kill switch rather than a carve-out list

A list of excluded command shapes is a code change. A switch is a setting.
Since the failure mode of an RTK regression is a command the executing binary
does not support, the response needs to be possible without a release, so each
rewritten class gets its own switch. The classes are read from the RTK
subcommand in the rewritten command RTK returned: file reads, Git, containers,
GitHub, tests, builds and type checks, package managers, and other. The plugin
computes the rewrite, classifies it, and discards the rewrite when its class is
disabled. The plugin does not maintain its own command catalogue.

### One command bypass marker

The bypass marker is a trailing `# no-opt` line comment. A command that carries
it is neither rewritten nor compacted. Detection is conservative: a marker
inside a quoted argument also disables optimisation for that command, because a
false bypass costs one command's optimisation while a missed bypass breaks the
user's escape hatch.

### Deterministic transformation, no model call

An extra model call to summarise output would add latency, cost, and a second
way to lose the one line that mattered. Every rule is a pure function of the
result text.

### Ported rules are rewritten to meet the preservation requirements

The category structure comes from the reference implementation, but the rules
must satisfy this change's spec: no file path, line number, error, warning,
commit message or matched line is removed from the complete candidate to save
space, and a rule with nothing safely removable leaves that candidate unchanged. The reference's Git status cap,
Git log line truncation, and search abbreviation are replaced. Attribution for
the ported structure goes into `NOTICE`.

### Nested `run_code` calls are recognised and skipped

The code-mode adapter issues `run_code_<requestId>` for nested calls. Add a
host capability that guarantees this reserved prefix and its propagation to
both hooks. The plugin requires that capability. A prefixed ID skips both
interventions; an ordinary unprefixed call remains eligible. Hosts without the
capability leave all calls unmodified. Regression coverage pairs an ordinary
bash call with a nested call so a broken guard cannot disable both and pass.
No new per-call flag is needed while this convention is guaranteed.

### Bind execution and state per invocation

Use the prerequisite's separate host and runtime paths and environments. Parse
the returned shell command sufficiently to bind every RTK executable token to
the verified runtime path and apply its environment. Never replace text inside
quoted arguments. Check all rewritten segments against per-class switches; if
any segment is disabled or cannot be bound safely, discard the whole rewrite.
Test paths with spaces, compound commands, pipelines and command-local PATH.
The absolute host binary handles only rewrite probes. Refresh resolution after
install/repair and runtime identity changes instead of holding unavailable or
stale answers for the whole session.

### Metrics measure plugin compaction only

The baseline is the complete captured output of the command that actually ran,
after any RTK filtering and before Sero truncation. The compared output is the
complete candidate produced by plugin compaction, before any presentation limit.
Measure both as UTF-8 bytes, excluding capture, rewrite and status notices.
RTK savings and provider billing are not inferred from these values.

Record `inputBytes` and `compactedBytes` for every measurable eligible call,
including unchanged and failed-compaction calls with equal counts. Eligibility
means an enabled, ordinary bash call without the bypass marker. Calls without
a complete capture are excluded from byte totals and shown as unmeasured,
except confirmed successful capture completion with zero output. The host
creates no capture record for that case; record inputBytes and compactedBytes
as zero and do not increase the unmeasured count. Distinguish this case from
incomplete capture metadata or unavailable capture evidence; absence of a
record alone does not prove zero output. Disabled and nested calls are excluded.
The session reduction is `(sum(inputBytes) - sum(compactedBytes)) /
sum(inputBytes)`; a zero denominator displays no percentage. Count each tool
call once across replay. Keep accounting metadata for unchanged calls too;
only an actual transformation gets an optimized-result marker.

The UI labels this as plugin compaction of captured shell output and shows
unmeasured-call counts. It does not describe the figure as native-command,
model-context or RTK savings. Forks inherit accounting entries in copied
history, while new entries belong to the fork; each session totals its own
history without double-counting replayed entries.

## Risks / Trade-offs

- **Protected data exceeds the preview budget** → Keep the full source in the
  capture, mark preview omissions, and verify recovery from the reported paths.
  Category rules must preserve diagnostics in the complete candidate; preview
  truncation is a separate presentation step and is not counted as savings.
- **A ported reference rule is lossy in a new way** → The ported rules are
  rewritten against the spec, and the tests cover the reference's known losses
  (`git status` above its cap, long `git log` messages, long search paths and
  lines) as explicit regressions.
- **A future RTK version changes a filter's behaviour** → The version is pinned.
  A bump requires re-running the harness before the pin changes.
- **Category rules diverge from their reference** → Port the category structure,
  rewrite every lossy rule against the preservation contract, and test search
  grouping with complete edit anchors.
- **RTK rewrites pipelines and lossy Git forms** → Search is excluded for the
  whole command, lossy Git history and diff forms are excluded, and Windows
  piped rewrites are skipped until the pipeline fixup lands.
- **Extension hooks fire for `run_code` shell calls** → The plugin recognises
  the nested call marker and skips both interventions. A task verifies it with a
  program that calls bash.
- **Reduced output is presented as billing savings** → Documentation and the UI
  distinguish reduced command output from a guaranteed reduction in cost. The
  reported share is against session shell output.
- **Bypass and kill switches add surface** → Both are checked before each
  intervention so they add no failure mode of their own.
- **The nested-call contract is unavailable** → Gate the plugin on the host
  capability that guarantees the `run_code_` call-ID convention. With that
  capability, a prefixed ID is nested and an unprefixed ID is an ordinary call.
  Without that capability, disable optimization for the session. Absence of a
  prefix alone is not evidence of an unknown nested call.

## Migration Plan

1. Land `add-managed-rtk-and-tool-result-capture` first. This change depends on both of
   its capabilities.
2. Ship the plugin disabled. An upgrade changes no session behaviour until a
   user enables it.
3. Run the bench harness and publish the numbers with the release, including the
   measured result for the requested-format requirement.
4. Rollback is disabling the profile toggle or the plugin. There is no data
   migration, and capture files remain inert.

## Open Questions

None. The user selected bounded previews with complete diagnostics and
structured output preserved in readable capture files. The presentation limit
is not a limit on the capture, and the preview is not promised to be complete
or parseable when it is truncated.
