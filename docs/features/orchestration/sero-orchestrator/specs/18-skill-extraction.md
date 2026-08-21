# 18 — Skill extraction (turn a proven Workflow into a skill)

## Summary

A Workflow that has completed at least one run holds knowledge: an objective, an
ordered plan, per-step instructions, the tools and agents each step used, what
failed and how it recovered, and the durable insights reflection has already
written down. Today that knowledge is reusable only *inside* Orchestrator — the
Loop Library ([08-loop-library.md](08-loop-library.md)) and the Loop Catalog
([14-loop-catalog.md](14-loop-catalog.md)) re-run the same machine.

**Skill extraction** is the other direction: one user-run pass reads a proven
Workflow and drafts a `SKILL.md` that teaches *any* Sero agent the method — the
everyday chat session, a subagent, a Room member, a later Workflow step. The
draft is reviewed and edited by the user before anything is written, and it lands
in the profile's normal skills directory, so the existing Admin skill
list/editor, the visibility controls, and hot reload all apply with no new
surface.

Library answers "run that workflow again". A skill answers "do this the way that
workflow proved works".

## Scope (v1)

Locked small, the same way reflection ([06-reflection.md](06-reflection.md)) was.

- **Source:** a **Workflow (Loop)** with at least one run that reached
  `completion: "complete"`. Rooms are a follow-up (see *Excluded*).
- **Trigger:** on demand only — a per-loop **Skill** button next to **Reflect**.
  No automatic extraction, no extraction on run completion, no batch sweep.
- **Output:** one `SKILL.md` (frontmatter + body). No bundled `scripts/`,
  `references/`, or `assets/` in v1.
- **Approval:** the pass produces a **draft**. Nothing reaches the skills
  directory until the user reviews it, may edit every field, and saves.
- **Write path:** a new, built-in-gated host capability. The plugin runtime never
  touches the filesystem itself.

## Built on existing primitives

| Need | Existing primitive | New work |
| --- | --- | --- |
| Durable evidence of what really happened | `RunDigest` + `digests.json` (spec 06) | Read-only reuse via `gatherHistory` |
| Lessons already learned about the loop | `LoopInsight[]` (spec 06) | Read-only reuse as prompt input |
| Strict structured model call | `runStructuredJson` (parse + bounded repair + raw-reply artifact) | Reused as-is |
| How to write a good skill | `skill-creator` skill template, copied into every profile | Refresh it (see below) and let the extractor load it |
| Pending item awaiting the user's decision | `LoopSuggestion` inbox shape | A `SkillDraft` with the same pending/decided lifecycle |
| Large text kept off the hot state file | Colocated artifacts (`host.writeArtifact`) | The draft body is an artifact; the loop keeps metadata |
| Skill files, listing, editing, hot reload | `ipc/agent/handlers/skills.ts` + Admin skill editor | Extract the store logic; add a gated runtime capability over it |
| Bundled-plugin-only capability | `builtin-gate.ts` (AD-029) | Reused verbatim for the new capability |

The genuinely new pieces are: the **extraction pass**, the **draft review UI**,
and the **`appRuntime.skills` host seam**.

## Goals / Non-goals

Goals:

- One user-run pass turns a proven Workflow into a reviewed, editable `SKILL.md`.
- The pass **may decline**: when a Workflow teaches nothing durable (a one-off
  task, a trivial single step), it returns no draft and says why. No churn.
- The generated skill is written for a **general agent**, not for Orchestrator: it
  describes the method, the order, the checks, and the traps the run history
  exposed — never "run step s3 of loop l7".
- Authoring quality comes from the **`skill-creator` skill**, loaded through the
  normal skill mechanism, not from rules duplicated into a prompt.
- The write is **authority-checked in the host**: fixed root, validated name, no
  silent overwrite, and the same hot reload the Admin editor triggers.

Non-goals (v1):

- **No automatic trigger.** Nothing extracts on its own.
- **No skill editing from Orchestrator.** After the save, Admin owns the file.
- **No bundled resources.** Body only. A skill needing `scripts/` is the user's
  job in Admin, guided by `skill-creator`.
- **No packaging or distribution.** Sharing Workflows stays the Catalog's job.
- **No new agent permission model.** A saved skill is an ordinary user skill and
  obeys the existing visibility and `disabledSkills` controls.

## Data model

New types in `shared/skill-types.ts`, re-exported from `shared/types.ts` (the
same split `reflection-types.ts` uses to hold the 500-LOC limit).

```ts
/** A proposed skill awaiting the user's review. One per loop; a new pass replaces it. */
export interface SkillDraft {
  id: string;
  createdAt: string;
  /** Slug proposed by the model, already validated: ^[a-z0-9][a-z0-9-]*$ */
  name: string;
  /** Frontmatter description — the trigger text, so it must say what AND when. */
  description: string;
  /** Artifact ref for the SKILL.md body (kept off the hot state file). */
  bodyRef: string;
  /** Run numbers the draft was extracted from, for the review header. */
  fromRunNumbers: number[];
  /** One line on what the model judged worth teaching. */
  rationale: string;
  status: 'pending' | 'saved' | 'discarded';
  decidedAt?: string;
}

/** Set once a draft from this loop has been saved as a skill. */
export interface LoopSkillLink {
  name: string;
  filePath: string;
  savedAt: string;
}

interface Loop {
  // …existing…
  /** The pending or last-decided extraction draft (see specs/18-skill-extraction.md). */
  skillDraft?: SkillDraft;
  /** Set when a draft was saved; drives the badge and the re-extract overwrite path. */
  skillLink?: LoopSkillLink;
}
```

Both fields are optional and absent on every existing loop, so loops that are
never extracted behave exactly as today.

The body lives at `loops/<id>/artifacts/skill-draft.json` (`{ "body": "…" }`)
through `host.writeArtifact`, the same colocation `digests.json` uses. The loop
record carries the ref, never the text. JSON rather than markdown for one
reason: the renderer watches JSON files through the app-state bridge
(`useWatchedJson`), so the review dialog reopens a pending draft after a reload
without re-running the pass.

## The extraction pass

New module `runtime/skill-extract.ts`, exporting
`proposeSkill(host, loop, history): Promise<SkillExtractOutput>`, built on
`runStructuredJson` (strict parse, bounded repair, raw-reply artifact).

### It runs as a background agent, not a pure model call

A pure model call cannot load a skill. The extractor therefore runs as a
**read-only background agent** in the loop's workspace (`platformTools:
'readOnly'`, which `runStructuredJson` gains as an option alongside its default
pure-model call), so it can:

- load and follow the profile's **`skill-creator`** skill, which is the authority
  on frontmatter, description quality, progressive disclosure, and body style;
- read files the plan's instructions actually name, so the skill can cite real
  paths, commands, and conventions instead of paraphrasing the plan.

It writes nothing. Its only output is the draft JSON. The step contract is the
existing one: a `readOnly` tool surface is already how Orchestrator runs
observation work, so no new execution or permission policy appears here.

### Prompt inputs

- the loop **goal** (`loop.prompt`), **title**, and **current plan** (JSON —
  steps, instructions, per-step tools and agent roles, dependencies);
- the **run digests** (`gatherHistory`), restricted to runs that completed, plus
  the failure summaries and recovery decisions from every run, because the traps
  are what a skill is most valuable for;
- the loop's durable **insights**;
- the **delivery destination**, so the skill states where results normally go;
- the existing **skill names** in the profile (`host.skills.list()`), so the
  proposed name does not collide and the draft does not restate a skill that
  already exists.

### System prompt (EXTRACTOR role), key rules

- Follow the `skill-creator` skill for structure, frontmatter, and style.
- Write for **a general Sero agent doing this work by hand** — never mention
  Orchestrator, loops, steps, or step ids.
- Teach only what the run history **evidences**: the order that worked, the
  checks that caught problems, the commands and paths that were used, and the
  traps that caused retries or recovery.
- `description` must state **what the skill does and when to use it** — it is the
  trigger text and the only part always in context.
- Keep the body **under 500 lines**, imperative, no preamble, no history of how
  the skill was made.
- **Return `{"skill": null, "reason": "…"}` when the Workflow teaches nothing
  durable and reusable.** Never invent a skill to look useful.

### Output and validation

```json
{
  "skill": {
    "name": "release-notes-from-merged-prs",
    "description": "…what and when…",
    "body": "…markdown…",
    "rationale": "…what is worth teaching, grounded in the runs…"
  }
}
```

The engine validates shape only — the model judges content:

- `name` matches `^[a-z0-9][a-z0-9-]*$` (repair pass on failure, then drop);
- `description` and `body` non-empty, body within the artifact size bound;
- a collision with an existing skill name is **not** a validation failure. It is
  surfaced in the review UI as a conflict the user resolves by renaming or
  overwriting.

A refusal (`"skill": null`) is a normal, successful result: no draft is stored,
and the reason is returned for the UI to show.

## Refreshing the `skill-creator` template

`packages/templates/skills/skill-creator/` is the upstream Anthropic skill. It is
the right authoring authority to reuse, but as it stands it is written for Claude
rather than for a Sero agent, and part of it does not apply here:

| Issue | Change |
| --- | --- |
| Body addresses "Claude" throughout | Rewrite in agent-neutral terms ("the agent", "another session"). |
| `scripts/init_skill.py` scaffolds a skill directory | Drop. Admin's **New skill** and the host write path create the directory. |
| `scripts/package_skill.py` builds a `.skill` zip | Drop. Sero installs skills from the skills directory and from agent plugins; there is no `.skill` install path. |
| `scripts/quick_validate.py` | Drop. `name`/`description` validation lives in the host write path, where it is enforced rather than advisory. |
| No mention of where skills live in Sero | Add a short section: `<SERO_AGENT_DIR>/skills/<name>/SKILL.md`, edited in Admin, hot-reloaded on save, hidden per-session through the visibility controls. |
| `LICENSE.txt` | Keep — the refreshed text is derived from the original. |

`references/workflows.md` and `references/output-patterns.md` stay; they are
generic and are what the extractor benefits from most.

**Existing profiles will not receive the refresh.** `copyMissingDirs` in
`apps/desktop/electron/features/profile/setup.ts` copies a template directory
only when the destination name is absent, which is correct for user-editable
files (an update must never overwrite a user's edits). The extraction pass must
therefore treat `skill-creator` as *optional*: it names the skill in its task
prompt, and produces a draft with or without it. Bringing template updates to
existing profiles is a separate, profile-wide question (a template version marker
and an opt-in "update built-in skills" action in Admin) and is out of scope here.

## Host seam: `appRuntime.skills`

The plugin runtime has no filesystem access and must not gain one. A new,
narrowly-shaped capability is added instead.

### Contract (`packages/common/src/app-runtime-background.ts`)

```ts
export interface AppRuntimeSkillSummary {
  name: string;
  description: string;
  filePath: string;
}

export interface AppRuntimeSkillWrite {
  /** Validated against ^[a-z0-9][a-z0-9-]*$; the host derives the path from it. */
  name: string;
  description: string;
  body: string;
  /** Optional provenance, written as a flat frontmatter key. */
  origin?: string;
  /** Refuse an existing name unless true. */
  overwrite?: boolean;
}

export interface AppRuntimeSkillsApi {
  /** User skills in this profile. */
  list(): Promise<AppRuntimeSkillSummary[]>;
  /** Writes <SERO_AGENT_DIR>/skills/<name>/SKILL.md and hot-reloads sessions. */
  write(skill: AppRuntimeSkillWrite): Promise<{ filePath: string; created: boolean }>;
}

interface AppRuntimeHost {
  // …existing…
  /** Present only for a bundled plugin that passes the built-in gate. Always check. */
  skills?: AppRuntimeSkillsApi;
}
```

`'appRuntime.skills'` is added to `SERO_HOST_CAPABILITIES`
(`packages/common/src/plugins.ts`). As the existing comment in that file states,
the list is a **compatibility declaration and grants nothing**.

It is deliberately NOT added to the Orchestrator's `requiredHostCapabilities`:
extraction is one feature, and a required entry would make the whole plugin
uninstallable on a host that predates it. `save_skill` checks `host.skills` at
run time and fails with a clear message instead — the same rule Room mode
follows for `persistentSessions`.

### Authority rules

- The caller supplies a **name, never a path**. The host joins it under
  `<SERO_AGENT_DIR>/skills/`, so traversal is impossible by construction rather
  than by check.
- An existing skill of that name is **refused** unless `overwrite: true`, which
  the UI sets only after the user resolves the conflict.
- Writes are atomic (temp file + rename) and trigger
  `reloadAllSessionResources()`, exactly as the Admin editor's write does.
- Frontmatter stays SDK-shaped: `name`, `description`, and the optional flat
  `origin` key (`sero-workflow:<loopId>`), which round-trips through the Admin
  editor's `extraFrontmatter` and lets the UI show which Workflow produced a
  skill.

### Gating

A skill file is prompt content loaded into every agent session, so write access is
a real privilege. The capability is installed by the app-runtime manager only for
a bundled built-in plugin that passes the built-in gate, the same way
`persistentSessions` is installed (AD-029). A third-party plugin declaring
`appRuntime.skills` gets a host with no `skills` property.

The gate itself moves to `capabilities/builtin-gate.ts`
(`evaluateBuiltinAppGate(input, allowlist)`) so both capabilities share one
implementation and one set of denial reasons; `persistent-sessions/builtin-gate.ts`
becomes its allowlist plus a thin delegation, keeping its existing exports and
tests.

### Shared skill store (refactor, not duplication)

The read/write/serialize logic currently sits inline in
`apps/desktop/electron/ipc/agent/handlers/skills.ts`. It moves to
`apps/desktop/electron/features/skills/store.ts`
(`listUserSkills`, `readSkillFile`, `writeSkillFile`, `deleteSkillFile`,
frontmatter serialization, path validation). The IPC handlers and the new
capability both call it, so there is exactly one authority for how a skill file is
written — and the handler file drops well under the 500-LOC limit.

## Actions

Added to `OrchestratorAction` (`shared/actions.ts`):

```ts
| { kind: 'extract_skill'; loopId: string }
| { kind: 'save_skill'; loopId: string; name: string; description: string;
    body: string; overwrite?: boolean }
| { kind: 'discard_skill_draft'; loopId: string }
```

Handled in a new `runtime/skill-actions.ts` (the coordinator delegates, as it does
for reflection):

- **`extract_skill`** — refuses when the loop has no run with
  `completion: "complete"` ("No successful run yet — a skill is extracted from
  what worked"). Otherwise runs `proposeSkill`, writes the body artifact, stores
  the draft `pending`, and returns `{ ok: true, skillDraft }` or
  `{ ok: true, skillDeclined: reason }`. A pending draft is replaced.
- **`save_skill`** — writes through `host.skills.write` with the **user's edited**
  values, records `loop.skillLink`, marks the draft `saved`. Without the
  capability it fails with a clear message. A name collision without `overwrite`
  returns the conflict so the UI can offer rename or overwrite.
- **`discard_skill_draft`** — marks the draft `discarded` and keeps it (so the
  loop shows "extraction declined/discarded" rather than silently nothing).

The `orchestrator` tool and slash command gain the three actions, mirroring how
`reflect` and `choose_suggestion` are exposed in `extension/tools.ts`.

## UI

- **Skill button** in the `LoopDetail` control row, next to **Library** and the
  **Reflect** button in `LoopControls`. It is shown when the run index holds a
  run with `completionStatus: "complete"` (or while a draft is still under
  review) and is disabled while busy. Click → `extract_skill`. It is the same
  shape of control the user already knows: user-run, model-judged, reversible.
- **`SkillDraftControl`** (`ui/components/SkillDraftControl.tsx`), modelled on
  `LibrarySaveControl`: a dialog showing the proposed **name**, **description**,
  and **body** — every field editable — plus the rationale and which runs it came
  from. Actions: **Save skill** and **Discard**. On a name conflict the dialog
  shows the existing skill and offers **Rename** or **Overwrite**.
- **Declined result:** a short line in the loop detail ("Nothing durable to teach
  yet — <reason>"), not a dialog. Extraction that declines must be as
  unremarkable as reflection returning no suggestions.
- **Saved badge** on the loop, like `LibraryLinkBadge`: the skill name, linking
  out to Admin → Skills for editing. Re-running extraction on a linked loop
  defaults the draft to the linked name with **Overwrite** pre-selected.

Nothing is added to the loop list or the home inbox: an unreviewed draft is not an
attention item, because the user just asked for it and is looking at the dialog.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-K1 | `extract_skill` is refused unless the loop has at least one run that reached `completion: "complete"`. |
| FR-K2 | The extraction pass runs as a read-only background agent in the loop's workspace and writes no file. |
| FR-K3 | The pass reads the plan, digests (including failures and recoveries), insights, delivery destination, and existing skill names. |
| FR-K4 | The pass may decline with a reason and store no draft; it never fabricates a skill. |
| FR-K5 | A produced draft carries a validated name, a description, a body stored as a colocated artifact, the source run numbers, and a rationale, with status `pending`. |
| FR-K6 | No file is written until the user saves; the user may edit name, description, and body first. |
| FR-K7 | `save_skill` writes through the host capability to `<SERO_AGENT_DIR>/skills/<name>/SKILL.md`, atomically, and hot-reloads active sessions. |
| FR-K8 | An existing skill name is refused unless the user chose overwrite. |
| FR-K9 | The host derives the target path from the validated name; a path supplied by a plugin is not accepted. |
| FR-K10 | `host.skills` is installed only for a bundled plugin that passes the built-in gate; declaring the capability grants nothing. |
| FR-K11 | A saved skill is an ordinary user skill: it appears in Admin, obeys visibility controls, and can be edited and deleted there. |
| FR-K12 | A saved draft records `loop.skillLink`; a later extraction on the same loop defaults to updating that skill. |
| FR-K13 | Extraction is on demand only — no automatic or scheduled trigger, and loops that are never extracted behave exactly as today. |

## Test plan

Deterministic throughout; no live model anywhere in this feature.

Extraction pass (fake host, scripted `runStructuredJson` replies):

- a plan plus a digest history with a recurring failure produces a draft whose
  rationale cites it;
- a `{"skill": null}` reply stores no draft and returns the reason;
- an invalid name is repaired once, then the draft is dropped rather than
  surfaced;
- the body is written as an artifact and the loop record holds only the ref.

Actions (fake host):

- `extract_skill` on a loop with no completed run is refused with the exact
  reason;
- `save_skill` calls `host.skills.write` with the **edited** values, not the
  proposed ones, and records `skillLink`;
- `save_skill` on a host without the capability fails with a clear message;
- a collision without `overwrite` returns the conflict and writes nothing;
- `discard_skill_draft` marks the draft discarded and writes nothing.

Host capability (temp `SERO_AGENT_DIR`):

- writes `<dir>/skills/<name>/SKILL.md` with `name` + `description` + `origin`
  frontmatter and the body verbatim;
- rejects `../escape`, an empty name, and an uppercase name;
- rejects an existing name without `overwrite` and replaces it with `overwrite`;
- the built-in gate denies a non-bundled package path (reuses the AD-029 fixture).

Skill store refactor:

- the existing skills IPC tests keep passing against the extracted store, proving
  one authority and no behaviour change.

UI:

- Skill button enablement follows completed-run state and busy;
- the dialog saves edited values;
- conflict state offers rename and overwrite.

## Phased implementation

1. **Host seam** — extract `features/skills/store.ts` from the IPC handler, add
   `AppRuntimeSkillsApi` + `capabilities/skills.ts`, wire the built-in gate, add
   `appRuntime.skills` to `SERO_HOST_CAPABILITIES`. Tests. Invisible to users.
2. **`skill-creator` refresh** — rewrite the template for a Sero agent, drop the
   packaging scripts, add the "where skills live in Sero" section.
3. **Extraction pass + actions** — `shared/skill-types.ts`, `skill-extract.ts`,
   `skill-actions.ts`, the three actions, the tool and slash command. Tests. No
   UI.
4. **UI** — Skill button, `SkillDraftControl` dialog, conflict handling, saved
   badge, declined line.
5. **Docs** — fold the new types into [01-data-model.md](01-data-model.md), add
   the row to the [index](index.md), and update
   `apps/docs-site/docs/guide/orchestrator.md` plus the skills section of
   `apps/docs-site/docs/guide/settings-models-admin.md` with the new path from
   Workflow to skill.

Each phase: `pnpm typecheck` green from the repo root and the Orchestrator suite
green before the next starts.

## Excluded from this iteration

- **Rooms.** A completed Room is the richer source — a roster of mandates, a
  message history, artifacts, and a closing brief — and deserves its own pass
  over that evidence rather than a reuse of the plan-shaped prompt here. The
  action shape, the draft record, the review dialog, and the whole host seam are
  written to be source-agnostic, so adding `extract_skill` for a Room is a new
  prompt and one more entry point, not a redesign.
- **Bundled resources.** Generating `scripts/` or `references/` alongside the body.
- **Cross-Workflow extraction.** One skill distilled from several related
  Workflows.
- **Automatic proposal.** Offering extraction when a Workflow completes cleanly
  for the Nth time. It is a clean later push hook, and deliberately not v1.
- **Template updates for existing profiles.** The `copyMissingDirs` limitation
  above is a profile-wide concern, not an Orchestrator one.
