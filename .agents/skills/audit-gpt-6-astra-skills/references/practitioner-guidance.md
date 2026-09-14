# Practitioner guidance: GPT-6 Astra skills and AGENTS.md cleanup

Dated working summary checked against Eric Provencher's X Article on 2026-09-06. This file paraphrases practitioner advice for optimizer use; it is not a verbatim copy of the source.

## Canonical sources

- Eric Provencher (@pvncher), [Rethinking skills and prompts for GPT-6 Astra](https://x.com/pvncher/status/2095991462416490862) (X Article)
- Complementary official docs: [Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model)

Treat the X Article as practitioner harness guidance (Codex / coding agents). Treat the OpenAI docs as the canonical API prompting and migration reference. Prefer `$optimize-gpt-6-astra-prompts` when the task is rewriting a product prompt rather than cleaning repo scaffolding.

## Core thesis

Coding agents needed heavy scaffolding a year ago. Much of that scaffolding now works against GPT-6 Astra: bloated skill descriptions, always-on recipes, full-repo pre-reads, and ask-first boundaries that stop work too early. A new model release is a good time to subtract.

Instructions arrive through Skills, `AGENTS.md`, and task prompts. Audit all three.

## Skill files

Skills are markdown (often with scripts). They help most for repeatable, domain-specific guidance—not as a dumping ground for every tip.

### Load fewer skills

Installing many skills is usually a mistake. Name and description are loaded so the model can decide when to open a skill. Extra descriptions consume always-on context and raise the chance of contradictory or overeager matches.

### Short, trigger-specific descriptions

Descriptions should be as short as possible while making the trigger clear.

- Bad pattern: a database skill whose description matches any database-adjacent work.
- Better pattern: trigger only for migrations (or the actual specialized workflow).

Avoid "pick me" energy—wording that bids for selection on weakly related tasks.

### Progressive disclosure

A useful skill discloses detail after selection. Reading a full skill costs context, brings compaction closer, and can inject guidance that does not apply. Keep the entry thin; put deep procedure behind the open.

### Less recipe, more outcome

Many skills were written as elaborate itineraries. Stronger models handle nuance better; over-specific step lists can hinder results that used to need them. Prefer outcomes, constraints, evidence, and stop conditions.

### Multi-model repositories

Repository skills also steer other contributors' agents on Sol, Luna, or other models. Guidance that helps a weaker model may overconstrain Astra. Note shared vs Astra-specific instructions when proposing edits.

### Skill authoring tooling

Codex `$skill-creator` guidance has been updated for these failure modes. When recommending new skills, favor short descriptions, progressive disclosure, and lean bodies.

## AGENTS.md

`AGENTS.md` applies whenever the model works in the repository. Revisit each always-on rule and ask whether every task still needs it.

### Stop mandatory full-repo reads

Requiring a stack of docs or a full repo map before every edit is excessive for small changes (e.g. typo fixes). Astra can decide what to read. Pointing to docs remains useful when contextual—not as a ritual before every edit.

Forcing file reads before every edit burns context and slows work.

### Recalibrate testing instructions

Earlier models needed encouragement to run tests. Astra tends to verify thoroughly on its own, so the same "always test broadly" instructions can cause unnecessary testing. Calibrate verification to change impact; keep required checks for meaningful risk.

### Give narrow permissions where it hesitates

Astra can be tentative about how far to take a task. Use `AGENTS.md` to grant permission for specific safe workflows—for example:

```text
The local tests use disposable fixtures and have no production access. Run them,
fix failures caused by the requested change, and rerun affected tests without
asking for approval at each step.
```

Keep production, destructive, and external-write gates explicit.

## Decision boundaries

Strong ask-first language added for older models that acted without permission can now stop Astra too early. Keep boundaries for irreversible or external actions. Soften or remove blanket approval requirements for reversible, in-scope, read-only, or already-authorized work.

## Persistence and completion

Compared with GPT-5.6 Sol, Astra may feel more tentative: it may return after a first implementation for review instead of continuing through run/inspect/fix loops.

- Define completion in the request when the task includes getting work running, inspecting results, and fixing failures.
- If further exploration is desired, say what to explore and where to stop.
- Prefer clarifying the finish line over adding another layer of process scaffolding.

## Suggested audit prompt

Users can ask Astra (or this skill's agent) to audit with wording along these lines:

```text
Audit Skills and AGENTS.md for GPT-6 Astra. Find unclear, conflicting, or
obsolete instructions that cause early stops, redundant approvals, wrong skill
loads, mandatory full-repo reads, or over-testing. Quote each issue, name the
file, explain the Astra impact, and propose a specific edit. Preserve intentional
safety gates and flag any change that expands authority. Prioritize the highest
practical wins. Propose edits for review before changing files.
```

## Evaluation

After cleanup, re-run representative tasks:

1. small edit / typo-class change (should not trigger full-repo ritual or huge test matrix);
2. medium feature with local tests (should persist through fix cycles when permitted);
3. irreversible or external action (should still stop for approval);
4. skill selection on a near-miss task (wrong skills should no longer auto-attach).

Measure fewer unnecessary pauses, lower context burn, correct skill selection, and unchanged safety behavior on gated actions.