---
name: skill-creator
description: Guide for writing and improving Sero skills. Use when the user wants to create a new skill, rewrite an existing one, or turn a repeated piece of work into reusable procedural knowledge for the agent.
license: Complete terms in LICENSE.txt
---

# Skill Creator

A skill is procedural knowledge an agent loads on demand: how a specific job is
done here, in this workspace, by this team. It turns a general agent into one
that already knows the method.

Use this guide to write a new skill, or to improve one that is not triggering or
not helping.

## Where skills live in Sero

| | |
| --- | --- |
| Path | `<SERO_AGENT_DIR>/skills/<skill-name>/SKILL.md` (`SERO_AGENT_DIR` is `~/.sero-ui/agent`) |
| Editing | Admin → Skills lists every skill and edits frontmatter and body |
| Loading | A saved skill hot-reloads into active sessions; no restart |
| Visibility | Admin controls which skills the model may invoke by itself |
| Other sources | Agent plugins ship their own skills; those are read-only here |

There is no packaging or install step. A directory with a `SKILL.md` in it is a
skill.

## Anatomy

```
skill-name/
├── SKILL.md            (required)
│   ├── frontmatter     name + description (required)
│   └── body            markdown instructions
├── scripts/            executable code (optional)
├── references/         docs loaded into context on demand (optional)
└── assets/             files used in the output, not read into context (optional)
```

### Frontmatter

Only two fields matter:

- `name` — lowercase letters, numbers and hyphens. It is also the directory name.
- `description` — **what the skill does AND when to use it.** This is the only
  part that is always in context, and it is the whole triggering mechanism. A
  vague description means the skill never loads.

Put every "when to use this" statement in the description, never in the body:
the body is read only after the skill has already triggered.

Weak: `description: Helps with reports.`
Strong: `description: Builds the weekly revenue report from the billing export. Use when the user asks for the weekly numbers, a revenue summary, or a billing reconciliation.`

### Body

Instructions for doing the work. Imperative, specific, and no longer than it has
to be. No preamble, no history of how the skill was made, no "when to use" list.

## Core principles

### Assume a capable agent

The agent is already competent. Add only what it cannot know: local paths,
commands, conventions, schemas, the order that works, and the traps that have
actually caused failures. Delete anything a general agent would do correctly
without being told.

### The context window is shared

Every line in a loaded skill competes with the user's real request. Challenge
each paragraph: does it change what the agent does? If not, cut it.

### Match freedom to fragility

- **High freedom (prose):** several approaches are valid; the choice depends on
  context.
- **Medium freedom (pseudocode, parameterised scripts):** a preferred pattern
  exists, but variation is fine.
- **Low freedom (an exact script, few parameters):** the operation is fragile,
  or one exact sequence is required.

Narrow bridge, strong guardrails. Open field, no fences.

### Progressive disclosure

Three loading levels:

1. `name` + `description` — always in context.
2. the SKILL.md body — after the skill triggers. Keep it under 500 lines.
3. `references/`, `scripts/`, `assets/` — only when the body sends the agent
   there.

When a skill covers several variants, keep the choice in SKILL.md and move each
variant into its own reference file:

```
cloud-deploy/
├── SKILL.md              (workflow + which provider)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

Rules that keep this working:

- Reference every bundled file from SKILL.md, and say **when** to read it.
  A file nothing points to is a file nothing reads.
- Keep references one level deep.
- Give a reference file longer than 100 lines a table of contents.
- State a fact in one place — SKILL.md **or** a reference, never both.

## Bundled resources

**`scripts/`** — code the agent would otherwise rewrite every time, or work that
must be deterministic. Cheap in context: a script can be run without being read.
Test a script by running it before shipping it.

**`references/`** — schemas, API documentation, domain rules, long procedures.
For a large file, put the useful grep patterns in SKILL.md.

**`assets/`** — templates, boilerplate, images, fonts: files that end up in the
output rather than in the context.

Do **not** add `README.md`, `CHANGELOG.md`, installation notes, or any other
file written for a human reader. A skill holds what the agent needs to do the
job, and nothing else.

## Writing a skill

### 1. Get concrete examples first

Ask what the skill must cover, and what a user would say that should trigger it.
Two or three real examples are enough. Ask a few questions, not many.

Skip this step only when the usage is already clear.

### 2. Decide what is reusable

For each example, ask: doing this from scratch, what gets rewritten every time?

- The same script → `scripts/`
- The same schema or rules being rediscovered → `references/`
- The same boilerplate being retyped → `assets/`

### 3. Write it

Create `<SERO_AGENT_DIR>/skills/<name>/SKILL.md`, or use **New skill** in
Admin → Skills. Write the resources first and SKILL.md last: the body is mostly
navigation to the resources.

Write for a fresh session with no memory of this conversation. Everything it
must know has to be in the skill or in a file the skill points to.

### 4. Test it

- Does it trigger? Start a new session and phrase a request the way a user would.
  If the skill does not load, the description is the problem.
- Does it help? Compare the result against the same request without the skill.
- Does every script run?

### 5. Iterate

Improve a skill right after using it, while the failure is fresh. Notice where
the agent struggled, fix that part, test again.

## Patterns

- **Multi-step or branching procedures:** see `references/workflows.md`.
- **Strict output formats or quality bars:** see `references/output-patterns.md`.

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| The skill never loads | The description says what, not when | Add the triggering situations and the words a user would use |
| The skill loads and nothing improves | It states what the agent already knows | Replace generalities with local paths, commands and traps |
| The body is long and half-read | Everything is in SKILL.md | Move detail into `references/`, keep navigation in the body |
| A bundled file is never used | Nothing points to it | Reference it from SKILL.md and say when to read it |
| The agent contradicts itself | The same rule exists in two files | Keep one authority per fact |
