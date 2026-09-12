## Why

Sero's `edit` tool is a copy of Pi's built-in `edit` with the multi-hunk `edits[]`
field removed, the per-path mutation queue dropped, and `promptSnippet` unset.
The result is a tool that can carry only one hunk per call, while the work the
model actually does needs several.

Session traces on this machine (349 session files, 159 with tool calls, 1342
`edit` calls) show the cost:

- 730 of 1342 `edit` calls (54%) sit in runs of three or more consecutive edits
  against the same file. The longest run is 17.
- Of 665 transitions inside those runs, 663 (99.7%) touch a different region.
  Only 2 look like corrections.
- The `edit` failure rate is 1.9%, and only 9 of those 25 failures were retried.

The model is not failing or looping. It does correct multi-hunk work, one hunk
per model turn, and pays a full model round trip for each hunk.

Two defects in the same surface compound the problem:

- The unified diff is computed into `details`, which no model sees and no
  renderer reads. A successful edit confirms nothing.
- The core runtime tools set no `promptSnippet`, so the session system prompt
  prints `Available tools:` followed by `(none)`. The tool `description` strings
  are then the only guidance channel.

## What Changes

- Restore `edits[]` on `edit`. Each `edits[].oldText` is matched against the
  original file content, not incrementally, and all hunks apply in one write.
  The existing `oldText`/`newText` shape stays supported, so no caller breaks.
- Add a per-path mutation queue and use it for `edit` and `write` on both the
  container and host paths. Identify targets by filesystem and canonical path,
  shared across sessions that access the same file. Compatible edits retain
  their changes; conflicting edits fail if their match text is no longer valid.
  A queued whole-file `write` still replaces the file. Cancelled calls must not
  start a write after waiting for the queue.
- Resolve exact and fuzzy hunks in one position model and preserve unchanged
  lines, including their whitespace and Unicode characters.
- Report what changed in model-visible result text. The diff moves from
  `details` into `content`, or a bounded summary of it does.
- Correct the failed-match message. It currently claims an exact match is
  required, but `fuzzyFindText` tolerates trailing whitespace and smart quotes.
  The message must describe the real matcher and give a location hint.
- Set `promptSnippet` on the core runtime tools so they appear in the system
  prompt.
- Steer `run_code` and `edit` descriptions at mutation work. `run_code` already
  reaches `tools.edit`, but its description names only read-side activities, so
  the model uses it only for reading and aggregating.
- Fix `StreamingFileWrite.tsx`, which reads `tool.input.content` for `edit`
  calls. Show single replacements from `newText` and array replacements from
  `edits[].newText`, including partial streamed input. The array takes precedence
  in the preview as it does during execution.
- Extend the eval suite so it builds sessions from Sero's host file-tool factory,
  add a metric that counts replacements per call and consecutive same-file edit
  runs, and record a before-and-after run on a fixed model, thinking level, and
  prompt.

**Behavior change (not a breaking schema change):** a call that sends both
`edits[]` and `oldText`/`newText` is valid today and silently ignores every hunk
after the first. After this change the `edits[]` hunks apply.

A batch containing a no-op replacement fails without writing and identifies
that replacement. This keeps the planned per-replacement validation rule. It
differs from Pi 0.84.2, which rejects a no-op only when the aggregate result is
unchanged.

## Capabilities

### New Capabilities

- `file-editing-tools`: the model-facing contract for reading, writing, and
  editing workspace files through the runtime tools. Covers multi-hunk edits,
  same-file concurrency, result feedback, and prompt guidance.

### Modified Capabilities

None. `programmatic-tool-calling` behaviour does not change. The change only
alters description text, and the serialization guarantee for nested calls is
stated in `file-editing-tools`.

## Impact

Affected code:

- `apps/desktop/electron/features/container/tools/tools-coding.ts`
- `apps/desktop/electron/features/container/tools/tools-host.ts`
- `apps/desktop/electron/features/container/tools/tool-schemas.ts`
- `apps/desktop/electron/features/container/filesystem/edit-helpers.ts`
- a new per-path mutation queue module beside `edit-helpers.ts`
- `apps/desktop/electron/features/code-mode/tool.ts` (description text only)
- `apps/desktop/src/components/layout/tool-call-helpers/StreamingFileWrite.tsx`
- `eval/seroProvider.ts`, a new assertion module beside
  `eval/assertions/toolSequence.ts`, and new scenarios under `eval/scenarios/`

Affected surfaces: ChatPanel sessions, background subagents, plugin tools that
call `edit`, persisted sessions, and remote Agent Nodes. The change is additive
for persisted sessions. Remote Agent Nodes run the same tool factories, so host
and container paths must stay in step.

This change captures the implementation follow-up only. It owns one evaluation
question: did the change reduce repeated same-file edit calls. Issue #516 owns
the comparative work: the product-by-product tool comparison, the anonymised
trace report, and the cost and token benchmark against other agents. The
recommendation here rests on trace evidence, and the before-and-after run is a
regression check, not a competitor benchmark.

Deliberately out of scope: an `apply_patch` or V4A tool, range-based or
hash-anchored edits, a multi-file patch envelope, and the 50 KB `read`
truncation limit. The traces show 33% of read results asking the model to
continue with an offset, which is its own cost, but it is a separate decision.
