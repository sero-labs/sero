---
name: audit-gpt-6-astra-skills
description: Audit and clean Skills, AGENTS.md, and coding-agent prompts for GPT-6 Astra using Eric Provencher's house-cleaning guidance. Use when Astra stops early, over-asks, over-tests, loads the wrong skills, burns context reading the whole repo, or when migrating a Codex/agent harness from GPT-5.6 Sol-era scaffolding.
---

# Audit GPT-6 Astra Skills and Agent Scaffold

Audit repository Skills, `AGENTS.md`, and task prompts for GPT-6 Astra. Prefer subtractive cleanup over adding more rules. Preserve intentional safety boundaries; remove obsolete handholding that now causes pauses, wrong skill loads, over-testing, or context burn.

## Sources

Read [references/practitioner-guidance.md](references/practitioner-guidance.md) for the checklist and examples. Primary source: Eric Provencher (@pvncher), [Rethinking skills and prompts for GPT-6 Astra](https://x.com/pvncher/status/2095991462416490862). For copy-ready prompt snippets and API migration, prefer `$optimize-gpt-6-astra-prompts` / the official [Using GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model) guide—this skill focuses on harness cleanup, not general prompt rewriting.

## Workflow

### 1. Scope the audit

Identify what exists in the working tree or paths the user named:

- skill directories (`SKILL.md`, descriptions, bundled scripts);
- `AGENTS.md` / equivalent always-on instruction files;
- recurring task prompts, system prompts, or harness defaults that force read-all / ask-first / always-test behavior.

Ask only if the audit target is unclear (which repo paths, which models share the instructions). Otherwise proceed.

### 2. Diagnose against Astra failure modes

Flag only issues that match observed or likely Astra behavior:

| Symptom | Likely cause |
| --- | --- |
| Wrong or extra skills load | Long / overlapping / "pick me" skill descriptions |
| Early pause or redundant approval | Strong ask-first language; unclear completion; conflicting skill vs user rules |
| Slow typo-sized edits | Always-read-full-repo or always-read-docs-first rules |
| Excessive tests on small changes | Sol-era "always run the full suite" encouragement |
| Stops after a first draft | Missing completion criteria or exploration bounds |
| Overconstrained on Astra but fine on Sol/Luna | Recipe-style skills written for weaker models |

### 3. Propose surgical edits

For each finding, return:

1. **File + quote** of the problematic instruction.
2. **How it hurts Astra** in one sentence.
3. **Proposed edit** (delete, shorten, narrow trigger, or replace with a permission/completion rule).
4. **Risk:** whether the change would expand authority; preserve explicit production / destructive / external-write gates.

Apply these cleanup rules:

**Skills**

- Keep `description` short and trigger-specific (when to use), not capability advertising.
- Prefer progressive disclosure: load detail only after the skill is selected.
- Replace elaborate itineraries with outcomes, constraints, and stop conditions.
- Do not recommend installing many unused skills; each description costs always-on context.
- If the same skill serves Sol/Luna and Astra, note where guidance overconstrains Astra and suggest model-specific splits only when needed.

**AGENTS.md**

- Drop blanket "read the whole repo / stack of docs before every edit."
- Keep contextual doc pointers; remove mandatory pre-read rituals that burn context.
- Soften or remove Sol-era always-test mandates; calibrate verification to change impact.
- Add narrow permissions where Astra is too tentative (e.g. local disposable tests may run and fix without per-step approval).
- Revisit strong ask-first language: keep it for irreversible/external actions; remove it for reversible in-scope work.

**Task prompts / persistence**

- Define completion before long work (implement, run, inspect, fix failures).
- If exploration is wanted, state what to explore and where to stop.
- Prefer push-to-complete language over new scaffolding layers.

### 4. Return format

Honor the user's format if given. Otherwise:

1. `Findings`: prioritized bullets (biggest practical win first).
2. `Proposed edits`: file-scoped diffs or replacement snippets.
3. `Preserve`: intentional safeguards left untouched.
4. `Optional next step`: a short prompt the user can paste to have Astra apply the approved edits.

Do not rewrite the entire prompt stack by default. Do not expand the agent's authority without labeling the risk. Do not invent policies the repo never stated.

## Completion bar

Finish when the audit covers the in-scope files, each finding has a quote and a concrete edit, intentional safeguards are preserved, and the result is lean enough for the user to approve or reject per change.