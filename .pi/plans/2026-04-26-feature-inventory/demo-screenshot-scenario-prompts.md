# Demo project prompts for Sero

**Demo profile:** `/Users/danielcarter/.sero-ui/profiles/serodemo`

Use these prompts inside Sero to create polished, synthetic demo projects. The
agent does not need to know these are for screenshots; the goal is simply to
create interesting workspaces and sessions that naturally show Sero well.

All demos should use fake data only. Do not include real customers, personal
facts, private URLs, API keys, tokens, real emails, private repo names, or
sensitive local paths.

## Recommended demo set

Create these as separate workspaces or separate sessions inside one demo profile:

1. **Phoenix Studio** — Vite + React + Tailwind product dashboard
2. **Orbit Docs** — Astro documentation site
3. **Signal CLI** — TypeScript command-line tool with tests
4. **Harbor API** — Fastify TypeScript API with sample data
5. **Atlas Design Tokens** — small design-system package
6. **Launch Notes Repo** — disposable Git workflow repo
7. **Ops Planner** — synthetic scheduler/reminder planning project
8. **Plugin Lab** — tiny Sero plugin concept workspace

---

# Global setup prompt

Use this once at the start of the demo profile.

```text
I am setting up a clean demo profile with synthetic projects. Help me create polished, realistic demo workspaces that are safe to show publicly.

General rules:
- all content must be fictional and synthetic
- do not use real names, real emails, private URLs, credentials, API keys, customer data, or personal notes
- prefer clear file names, short README files, and readable examples
- choose modern frameworks that are easy to run locally
- keep each project small but complete enough to inspect, run, and modify
- add helpful scripts where appropriate
- make the projects visually and structurally interesting, not generic placeholders
- summarize how to open, run, test, and modify each project

If you need to make a choice, choose the option that creates the clearest local development demo.
```

---

# Scenario 1 — Phoenix Studio

## Framework

Use **Vite + React + TypeScript + Tailwind**.

## Goal

Create a small product dashboard for a fictional design/operations studio. It
should have enough visual structure to make the workspace feel real: components,
mock data, routes or tabs, and a nice landing/dashboard screen.

## Suggested workspace/session name

`Phoenix Studio`

## Prompt

```text
Create a new demo project called Phoenix Studio using Vite, React, TypeScript, and Tailwind.

Make it a polished fictional product dashboard for a small design/operations studio. Let the details be synthetic and tasteful.

Please include:
- a clean project structure
- a short README explaining the fictional product
- mock data for projects, tasks, metrics, and activity
- reusable React components with clear names
- a visually interesting main dashboard
- at least one secondary view or tab, such as Projects, Activity, or Insights
- scripts for install/dev/build/check if appropriate
- a short terminal command or npm script that prints a useful synthetic status summary

Keep the implementation lightweight and local. Do not use real services, real companies, real customer names, credentials, private URLs, or personal data.

When done, summarize:
- how to run it
- which files are most useful to inspect
- what small change would be good for a follow-up coding task
```

## Follow-up task prompt

```text
Make one small improvement to Phoenix Studio that shows a realistic development workflow. Choose a focused change, update the code cleanly, and explain what changed. Prefer a change that creates a readable diff and improves the visible UI.
```

---

# Scenario 2 — Orbit Docs

## Framework

Use **Astro + TypeScript + Markdown/MDX**.

## Goal

Create a fictional internal documentation site for a small product team. It
should show docs navigation, structured content, and a tasteful static-site
project.

## Suggested workspace/session name

`Orbit Docs`

## Prompt

```text
Create a new demo project called Orbit Docs using Astro, TypeScript, and Markdown or MDX.

Make it a fictional internal documentation site for a product team. The content should be safe, synthetic, and useful-looking.

Please include:
- a short README
- a homepage
- at least three docs pages, such as Getting Started, Release Process, and Design Principles
- a small navigation structure
- clean styling that feels polished but not overbuilt
- fake examples, fake teams, and fake process notes only
- scripts to run and build the site

Do not use real company names, private project details, real URLs, secrets, credentials, or personal information.

When done, summarize:
- how to run the docs locally
- what pages were created
- what would make a good follow-up writing or editing task
```

## Follow-up task prompt

```text
Review Orbit Docs like a documentation maintainer. Improve one page for clarity, add one small cross-link, and explain the editorial change. Keep everything synthetic.
```

---

# Scenario 3 — Signal CLI

## Framework

Use **Node.js + TypeScript + Vitest**.

## Goal

Create a small command-line utility that analyzes synthetic project notes or task
entries. It should be easy to run in a terminal and produce readable output.

## Suggested workspace/session name

`Signal CLI`

## Prompt

```text
Create a new demo project called Signal CLI using Node.js, TypeScript, and Vitest.

Make it a small command-line tool that reads synthetic project/task data and prints useful summaries. The tool should be simple, well-structured, and easy to test.

Please include:
- a short README
- TypeScript source files with clear names
- synthetic fixture data
- at least two CLI commands or modes, such as summary and risks
- unit tests with Vitest
- package scripts for build, test, and running the CLI
- readable terminal output

All data must be fictional. Do not use real projects, real people, real paths, real URLs, credentials, or private details.

When done, summarize:
- how to run the CLI
- how to run tests
- which files are best to inspect
- one good follow-up feature idea
```

## Follow-up task prompt

```text
Add one small feature to Signal CLI. Choose something useful, such as filtering by priority, grouping by area, or exporting a short markdown summary. Include tests and explain the change.
```

---

# Scenario 4 — Harbor API

## Framework

Use **Fastify + TypeScript + Zod**.

## Goal

Create a small local API for fictional workspace data. It should demonstrate
backend code, validation, routes, sample data, and a simple local run flow.

## Suggested workspace/session name

`Harbor API`

## Prompt

```text
Create a new demo project called Harbor API using Fastify, TypeScript, and Zod.

Make it a small local API for fictional workspace/project data. Keep it lightweight and runnable without external services.

Please include:
- a short README
- a Fastify server entry point
- route modules with clear names
- Zod schemas for validation
- synthetic in-memory data
- endpoints such as health, projects, tasks, and activity
- package scripts for dev, build, and test or check
- example curl commands in the README

Do not use real services, databases, credentials, personal data, customer names, private URLs, or private paths.

When done, summarize:
- how to run the API
- what endpoints exist
- which file would be best for a small follow-up change
```

## Follow-up task prompt

```text
Add a small validated endpoint to Harbor API. Choose a useful endpoint based on the existing synthetic data, update the README examples, and explain how to test it locally.
```

---

# Scenario 5 — Atlas Design Tokens

## Framework

Use **TypeScript package + CSS variables + simple preview page**. Use Vite only
if useful for the preview.

## Goal

Create a small design-token package with colors, spacing, type scale, and a
preview page. This is useful for showing file structure, code, docs, and visual
preview.

## Suggested workspace/session name

`Atlas Design Tokens`

## Prompt

```text
Create a new demo project called Atlas Design Tokens.

Make it a small design-token package using TypeScript and CSS variables. Add a simple local preview page if it helps show the tokens clearly.

Please include:
- a short README
- token definitions for colors, spacing, radius, typography, and elevation
- generated or hand-authored CSS variables
- a simple preview page with swatches and examples
- package scripts for build/check/preview if appropriate
- fictional naming only

Keep it polished, compact, and easy to inspect. Do not use real brand names, private design systems, customer names, tokens, credentials, or private URLs.

When done, summarize:
- how the token package is structured
- how to preview it
- which files are most useful to open
- one good follow-up refactor or design task
```

## Follow-up task prompt

```text
Improve Atlas Design Tokens by adding one cohesive theme variation or one new component example. Keep the design tasteful and explain the change clearly.
```

---

# Scenario 6 — Launch Notes Repo

## Framework

Use a **plain Git repository with Markdown and small TypeScript or JSON files**.

## Goal

Create a disposable repo with meaningful branches, commits, and diffs. It should
be safe for Git Manager demos and agent-assisted Git workflows.

## Suggested workspace/session name

`Launch Notes Repo`

## Prompt

```text
Create a disposable Git demo repository called Launch Notes Repo.

This repo should be safe for experimenting with Git workflows. Use only synthetic content.

Please include:
- a short README explaining that it is a demo repo
- a few markdown files for fictional release notes, launch checklist, or product notes
- one or two small TypeScript or JSON files if useful
- an initial clean commit
- a feature branch with a small readable change
- one intentionally unstaged or staged change that creates a clean, readable diff
- short synthetic commit messages

Do not add a real remote. Do not use real customer names, real product roadmap details, real URLs, credentials, or private data.

When done, summarize:
- current branch state
- what changed
- which Git views would be interesting to inspect
- safe next Git tasks I can ask the agent to do
```

## Follow-up task prompt

```text
Use this disposable repo to demonstrate a safe Git workflow. Choose a small operation such as staging a change, writing a commit, comparing branches, or creating a cleanup branch. Avoid destructive operations unless you ask first.
```

---

# Scenario 7 — Ops Planner

## Framework

Use **Markdown + JSON/YAML + optional tiny TypeScript helper**.

## Goal

Create a project that naturally supports reminders, recurring tasks, and planning
sessions without needing real obligations or sensitive schedules.

## Suggested workspace/session name

`Ops Planner`

## Prompt

```text
Create a synthetic planning workspace called Ops Planner.

Make it a fictional operations planning repo with enough structure to support reminders, recurring review tasks, and lightweight planning sessions.

Please include:
- a README
- a weekly plan document
- a recurring review checklist
- a small JSON or YAML file with fake tasks/milestones
- optional tiny TypeScript helper script if useful
- suggested safe reminder/job ideas I can create in Sero later

All dates, tasks, people, projects, and milestones must be fictional. Do not use real schedules, personal reminders, customer details, credentials, or private URLs.

When done, summarize:
- what planning documents exist
- what reminders or recurring jobs would make sense to create
- how to clean up those reminders later
```

## Follow-up task prompt

```text
Using the synthetic Ops Planner workspace, suggest a small set of safe reminders and recurring review jobs I can create in Sero. Keep them generic, clearly fictional, and easy to delete later.
```

---

# Scenario 8 — Plugin Lab

## Framework

Use **documentation-first plugin planning**. Do not create a full plugin unless
asked. If creating code, use **TypeScript** and follow the Sero plugin docs.

## Goal

Create a small workspace that explores a fictional Sero plugin idea: manifest,
state shape, UI concept, and tool contract. This is useful for plugin author docs
without needing to install an external plugin.

## Suggested workspace/session name

`Plugin Lab`

## Prompt

```text
Create a synthetic plugin planning workspace called Plugin Lab.

Do not build or install a real plugin yet. Instead, create a documentation-first plan for a fictional Sero plugin that would be safe and useful as an example.

Please include:
- a README explaining the fictional plugin idea
- a draft package manifest outline
- a shared state shape in TypeScript or markdown
- a UI concept document
- a Pi extension/tool contract document
- a host capability checklist
- notes about what should be tested before implementation

Use only fake data. Do not use real service credentials, private APIs, real external plugin claims, customer names, or private URLs.

When done, summarize:
- what the plugin would do
- which files describe the UI, state, and tools
- what would be the first safe implementation step
```

## Follow-up task prompt

```text
Review the Plugin Lab plan against Sero's plugin author guidance. Improve the manifest outline, state shape, and host capability checklist. Keep it documentation-only unless I explicitly ask you to implement code.
```

---

# Suggested order to create the workspaces

1. **Phoenix Studio** first — best general-purpose visual workspace.
2. **Launch Notes Repo** second — best for Git workflows.
3. **Signal CLI** third — best for terminal/test output.
4. **Harbor API** fourth — best for backend/dev-server examples.
5. **Orbit Docs** fifth — best for docs/navigation examples.
6. **Atlas Design Tokens** sixth — best for visual preview and file structure.
7. **Ops Planner** seventh — best for Scheduler/reminders.
8. **Plugin Lab** eighth — best for plugin authoring discussions.

# General follow-up prompts

Use these in any workspace.

## Ask for a readable status summary

```text
Give me a concise status summary of this demo workspace: what it is, how to run it, which files are most important, and one safe next task.
```

## Ask for a small coding change

```text
Make one small, well-scoped improvement to this demo project. Choose the change yourself based on what would be most useful. Keep the diff readable, update docs if needed, and explain how to verify it.
```

## Ask for cleanup guidance

```text
Review this demo workspace for temporary state or generated files. Suggest safe cleanup steps, but do not delete anything until I confirm.
```

## Ask for a session title/summary

```text
Create a short session title and two-sentence summary for this demo workspace. Keep it fictional, readable, and safe to show publicly.
```

# Cleanup prompt for the full demo profile

Use this when you are done creating demo material.

```text
Review the demo profile/workspaces we created and list cleanup recommendations. Include temporary reminders, scheduled jobs, web bookmarks/history, demo plugin installs, gateway/web tokens, generated build folders, and disposable Git branches. Do not delete anything until I confirm.
```
