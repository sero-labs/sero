## Context

See `proposal.md` for motivation and `specs/file-editing-tools/spec.md` for the
behaviour contract. This section records only the constraints that shape the
approach.

- Sero's `read`, `write`, and `edit` are copies of Pi's built-in tools. The
  matching, BOM, and line-ending helpers in
  `apps/desktop/electron/features/container/filesystem/edit-helpers.ts` are
  ported from Pi's `core/tools/edit-diff.ts`.
- The factories are near-duplicates. `tools-coding.ts` (432 lines) serves the
  container runtime through `runtime.readFile` / `runtime.writeFile`.
  `tools-host.ts` (484 lines) serves the host runtime through `node:fs` and a
  bash spawn. The edit implementation appears in both, with the same steps in
  the same order.
- `run_code` nests the active session tools as async host functions and
  preserves permission hooks. It cannot call itself.
- Protected-path and memory-file guards resolve differently per backend, so
  guard resolution cannot be shared.
- Repository rules: no `any` or `@ts-ignore`, every source file at most 500
  lines, and `pnpm typecheck` must pass.

## Goals / Non-Goals

**Goals:**

- One `edit` call carries several disjoint replacements and writes the file once.
- Concurrent compatible edits to one file retain their changes. Conflicting
  edits fail against current content, and whole-file writes run in sequence.
  The same rules apply to mutations issued from inside a program.
- The model receives feedback it can act on, on success and on failure.
- The core file tools appear in the session system prompt.

**Non-Goals:**

- A new tool name, an `apply_patch` or V4A tool, or a multi-file patch envelope.
- Range-based, line-based, or hash-anchored edit addressing.
- Changing the protected-path, memory-file, permission, or audit behaviour.
- Changing the `read` truncation limits. The 50 KB byte cap causes 33% of read
  results to request a continuation, but that is a separate decision.
- Closing the container write-timeout window that can leave a partial file.

## Decisions

### D1: Extend `edit` with an ordered replacement array

Rationale: this is Pi parity. The matcher, BOM handling, line-ending restore,
and diff generation already exist. The tool name and its meaning stay the same,
so no description budget is spent on a second mutation tool.

Alternatives considered:

- **A separate `multi_edit` tool.** Doubles the mutation description surface and
  splits model attention between two tools that differ only in arity.
- **An `apply_patch` / V4A tool.** A trained format that handles multiple files,
  but it is a real grammar, it introduces a partial-apply window across files,
  and it widens the permission and audit surface. Rejected for this change. The
  proposal records it as out of scope.
- **Range or hash-anchored edits.** Removes the `oldText` echo and its tokens,
  but requires `read` to return stable references, which is a larger contract
  change across every consumer of `read`.

**Atomicity.** All replacements resolve against the original content and apply in
one write. If any replacement fails to match, is ambiguous, or changes nothing,
the call writes nothing and identifies the failing replacement. Here, original
content means the file read after queue admission, not an earlier model read.
This is validation atomicity; it does not promise rollback after a write starts.

**No-op policy.** Keep the planned per-replacement rejection rule, including a
batch with one no-op and one real change. Pi 0.84.2 instead rejects only when the
aggregate result is unchanged. Sero deliberately differs so a successful batch
confirms that each requested replacement changed its matched text. Test this
case explicitly rather than treating the whole implementation as Pi parity.

**Mixed matching.** The current `fuzzyFindText` returns exact-match positions in
the original LF content and fuzzy-match positions in a normalized copy. Trailing
whitespace removal changes offsets, so these positions cannot be combined.
Resolve all hunks in one common content view: when any hunk needs fuzzy matching,
rematch every hunk against the same fuzzy-normalized original content. Check
uniqueness, overlap, and per-hunk no-ops in that view before applying changes.
Use Pi's unchanged-line preservation approach to map changed line regions back
onto the original content. Keep unchanged lines, including their whitespace and
Unicode characters, and retain the existing BOM and line-ending policy. Compute
the diff against the original content so feedback includes every applied change.

Tests must mix exact and fuzzy hunks with trailing whitespace before both
regions, include overlap after normalization, and check BOM/CRLF preservation.
The existing single-hunk path also uses this preservation rule; copying its
current whole-file fuzzy normalization would retain an unintended rewrite.

**Input form conflict.** A call may supply the array, the single replacement
fields, or both. The array is authoritative. This removes the current hazard
where a call that carries both forms validates and silently drops every array
entry after the first.

### D2: Keep `run_code` as a secondary mutation path and steer it by text

`run_code` already reaches `tools.edit` with permission hooks intact. Traces show
nine calls in the corpus and all nine read and aggregate; none mutate. Its
description names only read-side activities, so the model built a correct but
narrow mental model.

Decision: add mutation to the described purpose, but do not make it the primary
multi-hunk mechanism. The direct array form is cheaper for the common case and
leaves a simpler audit trail.

Alternatives considered:

- **Prompt-only change, no schema change.** Free. Rejected because every
  multi-hunk edit would pay program-authoring cost, and because the review
  found the concurrency guarantee missing, which the prompt change depends on.
- **Remove `run_code` from mutation work.** Rejected. It is the right tool for
  reading many files and then writing a derived result in one turn.

### D3: Add a per-path mutation queue, ported from Pi

Rationale: Pi's `withFileMutationQueue` resolves host paths with `realpath` and
serializes mutations to that target. Sero needs the same critical section with
backend-aware file identity. A container path cannot be resolved on the host,
and two containers can have different files at the same absolute path.

Placement: a new module beside `edit-helpers.ts`, imported by the shared edit
implementation (D8) and by both `write` factories.

Required properties:

- The queue key combines filesystem identity and canonical absolute path. Host
  calls share one host filesystem namespace across sessions and factories.
  Container calls use a stable identity for the actual container filesystem,
  shared by all adapters and sessions that access it. Do not key by session or
  runtime object identity. Separate containers with separate backing files must
  not collide at `/workspace/file.ts`.
- Resolve `.` and `..` and stable symlinks through the target backend. For a
  missing write target, resolve its nearest existing parent and append the
  missing path segments. Resolve container aliases inside that container, never
  with host `realpath`. Where runtime metadata identifies a shared host mount,
  map that path to the same host file identity used by host tools.
- `write` and `edit` share the queue for a path, so a `write` cannot interleave
  with an `edit` read-modify-write span. Hold the lock from before the edit read
  through write settlement. Each edit validates against current content after
  admission. Compatible edits survive; a later edit whose match was removed
  fails without writing. A later whole-file write intentionally replaces prior
  content. Serialization does not merge a write payload with prior edits.
- Check cancellation after queue admission and after awaited preparation,
  including guard resolution and reads. Check again immediately before starting
  a write. A cancelled queued call must release its turn without writing, and a
  failed or cancelled call must not prevent later calls from running.
- The lock is held until the write settles. It must not be released by an abort
  listener while a write is still in flight, or a concurrent mutation can enter
  the critical section. Observe cancellation after settlement without claiming
  rollback or that the file is unchanged. This applies to both tools and both
  backends, including nested calls from `run_code`.
- Nested acquisition on the same path must not deadlock. This needs an explicit
  test.

This is an in-process queue shared across sessions. It does not coordinate
external filesystem writers or other Sero processes. Matching current content
does not detect every change since an earlier model read; it detects whether
the requested replacement remains valid under the existing matcher.

Alternatives considered:

- **Reject concurrent same-file edits.** Punishes legitimate use, including
  `run_code` batching and parallel subagents. Also turns a silent bug into a
  frequent user-visible failure.
- **One lock per session.** Too coarse. It would serialize unrelated files.

### D4: Put a bounded diff in the model-visible result

Rationale: a successful edit currently reports
`Successfully replaced text in <path>.` and nothing else. The model cannot verify
what it wrote without a re-read, and re-reads are expensive: a third of all read
results already return partial content.

The result content gains the changed region with added and removed lines. The
existing context-line generation stays. The shown line count is capped and the
result carries an explicit truncation marker when it hits the cap.

The structured detail stays on the result for UI and log consumers so existing
non-model consumers do not break.

Alternatives considered:

- **Keep the one-line success text.** Rejected. It is the reason the model cannot
  self-verify.
- **Return the unbounded diff.** Rejected. The diff is re-sent on every later
  turn, so history cost grows with change size, not with change count.

### D5: Set tool summaries and guidelines instead of adding a project system prompt

Rationale: the SDK exposes `promptSnippet` and `promptGuidelines` on the tool
definition, and the session prompt surfaces a tool only when its definition
carries a summary. Sero's core tools set neither, so the prompt prints
`Available tools:` followed by `(none)`. Fixing this at the tool level keeps the
summary with the tool, so it follows the session's tool policy.

A Sero `SYSTEM.md` would work too, but it becomes a second source of truth and
would diverge per profile. Rejected.

Related defect: because the built-in search tools are disabled, the prompt asks
the SDK to inject `Use bash for file operations like ls, rg, find`, which
contradicts the `run_code` guidance. Guideline text must be additive and must not
contradict an active search tool.

### D6: Describe the real matcher in the failure message

Rationale: the message tells the model the match text "must match exactly
including all whitespace and newlines", but the matcher tolerates trailing
whitespace and smart quotes. The message also gives no location, while the
observed failures quote 557 and 1442 characters and miss.

The failure result states the real rule and, on a miss, names the nearest
candidate region computed from the normalized content. Ambiguous matches report
the count. No-op replacements explain that no change resulted.

Alternative considered: keep Pi's exact wording for verbatim parity. Rejected.
Accuracy beats verbatim parity on the one message that drives recovery.

### D7: Fix the streaming edit preview to read the edit payload

`StreamingFileWrite.tsx` reads `tool.input.content`, which only `write` sends.
`edit` sends `newText` in the single form and `edits[].newText` in the array form.
The current preview therefore renders an empty body labelled
`replacement · 0 lines`.

Select `content` for `write`. For `edit`, use the array whenever it is present;
otherwise use top-level `newText`. Show available string payloads in array order
with a visual separator between entries. Sum each payload's line count using
the current trailing-newline rule. Separators do not count as replacement lines.
An empty replacement string contributes zero lines. Missing or incomplete
entries contribute no text and must not cause an error. An incomplete array
must not fall back to conflicting top-level fields. Keep the existing 200-line
tail budget across all entries, rather than allocating it per entry.

Alternative considered: render the diff from the structured detail. That
duplicates the model-facing string and is a larger UI change. Deferred.

### D8: Extract one shared edit implementation for both backends

Rationale: two forces point the same way.

1. Duplication is where the drift came from. The same three defects exist
   identically in both factories because the code was copied.
2. `tools-host.ts` is at 484 of 500 lines. The array form, the queue usage, the
   bounded diff, and the failure hints would push it over the repository limit.

Approach: one module holds the edit logic and takes a small file-I/O port. The
container adapter supplies `runtime.readFile` / `runtime.writeFile`. The host
adapter supplies `node:fs`. Each factory keeps its own guard resolution, because
protected-path resolution differs per backend. Each adapter supplies the
backend-aware canonical file identity described in D3. The `write` tool uses
the same module or the same queue, so both mutations share one lock.

Alternative considered: apply the change twice, once per factory. Rejected. The
repository will hit the line limit, and the next change would drift again.

### D9: Make the eval suite exercise the runtime tools

Rationale: every existing eval provider builds a session without Sero's runtime
tools. `eval/seroProvider.ts` passes Pi's built-in coding tools, and
`eval/snapshotProvider.ts` passes an empty tool list. Neither imports
`createRuntimeTools`. The suite therefore cannot observe the code this change
modifies, and it never covered the missing tool summaries either.

Decision: add an eval provider mode that builds its session from Sero's host
file-tool factory with Pi's built-in tools disabled. That factory takes a plain
directory and needs no container, and the existing host tool tests already call
it that way. The default eval mode keeps Pi's built-in tools, so the existing
baselines and the search and snapshot evals keep their meaning.

The provider already records the arguments of every tool call, so the new metric
needs no new plumbing. It reads the replacement count per `edit` call and the
path per call.

Alternatives considered:

- **Replace the built-in tools in the default eval mode.** Rejected. It changes
  the meaning of the existing baselines and the search comparison.
- **Measure with hand-run scripts only.** Rejected. The metric would not be
  reproducible and would not run in CI, and `promptfooconfig.yaml` already
  triggers CI on `eval/` changes.

## Risks / Trade-offs

- **[Both input forms sent; the array wins silently]** → This is intended, but
  must be explicit in the spec and covered by a test, so the behaviour is
  documented rather than accidental.
- **[Nested acquisition of the same path deadlocks]** → The queue must tolerate
  nested or re-entrant acquisition, or must never be held across a nested call
  that targets the same path. Requires a dedicated test. This is the highest-risk
  item in the change.
- **[Bounded diff still inflates history tokens]** → The recorded before-and-after
  run measures the net effect on tokens and wall time. Keep the cap tight and
  mark truncation, then set the final cap from that run rather than by guess.
- **[The eval suite grades a different tool implementation than Sero ships]** →
  D9 adds a provider mode built on the host file-tool factory. The prompt-stability
  suite still uses no tools, so it cannot detect the summary fix; task 7.8 keeps
  its baselines honest rather than claiming coverage.
- **[Prompt growth from summaries and guidelines]** → One line per tool, and
  guidelines attach only to active tools.
- **[Guideline text contradicts an active search tool]** → Make guidelines
  additive, and test the prompt with and without search tools active.
- **[Host and container drift during implementation]** → D8 gives one shared
  implementation. Add a parity test that runs the same multi-replacement call and
  the same failing call against both backends.
- **[Container writes can time out and leave a truncated file]** → The queue does
  not address this. The 30-second stdin write timeout with `cat >` truncates
  before it streams. This risk is recorded and should be raised as its own issue;
  it is out of scope for this contract.
- **[Changing model-visible result text breaks assertions]** → Existing tests that
  assert the current success or failure strings must be updated in the same
  change.

## Migration Plan

1. Record the pre-change evaluation baseline on a fixed model, thinking level,
   prompt, and workspace snapshot.
2. Add the queue module and the shared edit implementation, with tests.
3. Wire both factories to the shared implementation. Keep the single-replacement
   input form and matcher, while preserving unchanged lines during fuzzy edits.
4. Add the array form and the input-form conflict rule, with atomicity tests.
5. Add the bounded model-visible diff and the corrected failure messages. Update
   affected assertions.
6. Add summaries and guidelines to the core tools. Verify the rendered prompt.
7. Fix the streaming preview.
8. Re-run the evaluation task set and compare against the baseline.

Rollback: revert the change. Nothing is persisted and no session, layout, or
storage schema changes, so there is no data migration to unwind. Persisted
sessions that contain older single-replacement calls replay unchanged.

## Open Questions

- The final diff cap, in lines and bytes. The recorded baseline now supplies the
  token data, so task 7.7 sets it. Only the exact number stays open.
- Whether to drop the injected `Use bash for file operations` guideline once
  search tools are guaranteed active in every session. Deferrable.
- Whether the container write timeout should be raised or the write should become
  atomic-then-rename. Deferrable, recorded as a risk above.
- Whether the eval suite should eventually run the container backend too. Deferrable.
  The host factory covers the shared edit core, and the parity test in task 6.1
  covers the container path.
