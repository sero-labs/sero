## Why

Coding agents spend context on verbose test, build, lint, Git and
package-manager output. Most of those bytes are progress noise; the errors and
warnings inside them are a small fraction. Reducing that noise before it
reaches the model leaves more room for the work.

The preceding change supplies the two things a plugin cannot provide for
itself: a pinned RTK that exists both on the host and inside the workspace
container, and the complete command output kept outside the model context.
This change adds the plugin that uses them.

## What Changes

- Add a built-in, optional plugin, `sero-output-optimizer-plugin`, shipped
  disabled and enabled per profile.
- Rewrite supported shell commands through the managed RTK before execution,
  and fall back to the original command whenever RTK is unavailable, declines
  the command, fails, or exceeds its time budget.
- Exclude search commands (`grep`, `rg`, `find`) from rewriting, including
  search commands that appear inside a pipe or a compound command. The plugin
  groups their output itself, keeping every file path complete and every
  matched line intact.
- Exclude the lossy Git history and diff forms (`git log`, `git diff`,
  `git show`) from rewriting, because RTK truncates commit messages and hunks.
  Keep `git status`.
- Skip piped rewrites on Windows, where the producer's exit status and filter
  semantics need the fixup the reference implementation carries.
- Compact completed bash results for the Safe categories: test summaries that
  keep failures, build and type-check progress filtered around errors and
  warnings, aggregated linter diagnostics, Git status and log, and
  package-manager progress.
- Apply compaction to complete captures, preserving diagnostics, file paths,
  line numbers, commit identifiers, commit messages and matched lines in the
  candidate before presentation. Keep the existing bounded model preview;
  content that cannot fit remains complete in readable capture files. Mark
  omissions and keep failure status visible. Unknown categories stay unchanged.
- Bypass rewriting and content transformation for requested structured formats.
  Keep stdout byte-exact and separate from stderr and reporting text. Small
  structured payloads remain intact; oversized previews are marked incomplete
  and link to the complete parseable source file.
- Record the rewritten command in the result, because a `tool_call` mutation
  does not change the persisted tool call, so the transcript would otherwise
  show a command that never ran. Keep this separate execution report even when
  capture or compaction fails, while preserving the received payload and status.
- Report the complete output path and size in the model-visible result, and
  keep that report through compaction. Carry the structured optimisation
  metrics in `details` for the plugin UI.
- Open a large capture in a dedicated viewer with a bounded inline preview, so
  the tool call stays light while the complete file stays reachable.
- Add settings: enable, a per-class kill switch for rewriting, and a toggle for
  optimisation notices. A single command is bypassed with the `# no-opt`
  marker.
- Report per-session plugin compaction bytes before presentation limits. Include
  unchanged eligible calls, count confirmed empty output as measured zero input
  and output bytes, disclose unmeasured calls, and do not infer RTK or
  provider savings from captured output.
- Bind each rewritten invocation to the verified runtime executable and its
  session state environment. Treat RTK exit codes as rewrite-candidate outcomes
  without bypassing Sero permission checks.
- Suppress rewriting and compaction for shell commands issued inside
  `run_code`. Those calls reach the extension hooks, so the plugin must
  recognise and skip them.
- Decision change from the source issue: the blanket exclusion of piped
  rewrites is dropped on non-Windows hosts; the Windows exclusion remains. Measurement shows `rtk git status | tail -5` is harmless, so a veto
  would remove value to prevent nothing. The redirected part of that exclusion
  has no effect either, because RTK 0.49 does not rewrite `>` or `>>` forms.

## Capabilities

### New Capabilities

- `tool-output-optimisation`: optional command rewriting and result compaction
  for shell tools, with fail-open behaviour, per-class kill switches, a
  single-command bypass, complete output discoverable when capture succeeds, and
  session-level savings reporting.

### Modified Capabilities

None. `programmatic-tool-calling` covers `run_code` and its nested tool calls.
This plugin does not change that capability's requirements; it suppresses its
own interventions for nested shell calls, so nested behaviour stays unchanged.
Compaction applies to shell tool results only.

## Impact

- New plugin package at `plugins/sero-output-optimizer-plugin/`, with an
  extension, shared state, and a settings UI.
- Depends on `managed-rtk-toolchain` and `tool-result-capture` from
  `add-managed-rtk-and-tool-result-capture`. It cannot ship before that change.
- `apps/desktop/electron/features/code-mode/tool-adapter.ts` — confirm the
  reserved nested-call marker is propagated to both hooks and advertise that
  guarantee as a required host capability. Ordinary unprefixed calls remain
  eligible; incompatible hosts leave optimization disabled.
- `plugins/sero-output-optimizer-plugin/` — compaction rules ported in
  structure from `pi-rtk-optimizer` (MIT, Copyright (c) 2026 MasuRii). The
  lossy rules are rewritten to meet the preservation requirements, and the
  attribution goes into the repository `NOTICE`.
- `apps/docs-site/docs/` — user and plugin-author documentation.
- No new JavaScript dependency. Compaction rules are written in the plugin.
- Out of scope, recorded so it is a decision rather than an oversight:
  non-shell tool output is not compacted. Bash calls nested inside `run_code`
  are suppressed explicitly, because that path does raise the extension hooks.
