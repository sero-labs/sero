# Plugin End-to-End Example

For the smallest example that exercises **every** plugin surface — UI, extension,
CLI bridge, background runtime, prompts, skills, and dashboard widgets — use the
external **Logbook** plugin. It is a real, installable external plugin (published
dependencies only), so you can clone it, build it, and copy patterns directly.

## Canonical example

- repo: [`sero-labs/sero-logbook-plugin`](https://github.com/sero-labs/sero-logbook-plugin)

**Logbook** is a per-workspace dev worklog with a daily streak. It is the best
reference when you need to see how one plugin ships all of these together, each
backed by a single JSON state file:

- a React UI using every app-runtime hook
- a Pi extension with a tool and a bridged CLI surface (`sero logbook …`)
- a plugin-owned background runtime
- a `pi.prompts` prompt template (`/standup`) and a `pi.skills` plugin skill
- static and dynamically-registered dashboard widgets
- shared state types across all three surfaces

Its `README.md` has a surface→file map so you can jump straight to the piece you
need. Because it depends only on published `@sero-ai/app-runtime` and
`@sero-ai/common` (no `workspace:*`, no `@sero-ai/ui`), everything you copy from
it installs standalone.

## File shape

```text
sero-logbook-plugin/
├── package.json
├── extension/
├── runtime/
├── prompts/
├── skills/
├── shared/
├── ui/
└── vite.config.ts
```

## Which example to start from

### Start from Daily Quote when you want:
- the fastest starter path
- UI + extension only
- the simplest structure to copy first

See [Plugin Quickstart](/reference/plugin-quickstart).

### Start from Logbook when you want:
- every surface in one installable external plugin
- runtime, prompts, skills, and widgets together
- patterns you can copy without hitting `workspace:*` dependencies

## In-repo (monorepo) equivalent

If you are building a **built-in** plugin inside the Sero monorepo, the
`sero-notes-plugin` template covers the same UI + extension + runtime + widget
surfaces wired for `workspace:*` local packages:

- example folder:
  [`packages/templates/skills/sero-plugin/example/sero-notes-plugin/`](https://github.com/sero-labs/sero/tree/main/packages/templates/skills/sero-plugin/example/sero-notes-plugin)
- walkthrough:
  [`packages/templates/skills/sero-plugin/example/README.md`](https://github.com/sero-labs/sero/blob/main/packages/templates/skills/sero-plugin/example/README.md)

It is **not** an external-install reference — it uses `workspace:*` and
`@sero-ai/ui`, which only resolve inside the monorepo. For an external plugin,
use Logbook above.

## Source-material version

For the deeper repo-side writeup, see:
- [`docs/plugins/end-to-end-example.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/end-to-end-example.md)

## See also

- [Plugins](/reference/plugins)
- [Plugin Quickstart](/reference/plugin-quickstart)
