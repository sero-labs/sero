# Reference

Use the reference when you need canonical details about architecture, runtime behavior, state locations, plugin authoring, quality gates, or support boundaries.

## Runtime reference

- [Architecture](/reference/architecture) — shell model, workspaces, runtime modes, and plugins.
- [Containers and Host Mode](/reference/containers-host-mode) — workspace runtime modes, requirements, logs, and caveats.
- [Container Isolation](/reference/container-isolation) — per-workspace container lifecycle, mounts, networking, dev-server registry behavior, and host fallback.
- [Sero CLI](/reference/sero-cli) — source-checked command syntax, namespaces, output, side effects, batch behavior, and plugin bridging.
- [State and Folders](/reference/state-and-folders) — profile paths, workspace state, app state, memory storage, and redaction guidance.
- [`models.json`](/reference/models-json) — local/custom model provider schema, examples, discovery behavior, and recovery.
- [Agent Definitions](/reference/agent-definitions) — subagent Markdown frontmatter, model resolution, settings, and child-session limits.

## Plugin authors

- [Plugins](/reference/plugins) — distribution modes, local development, and alpha guidance.
- [App Runtime](/reference/app-runtime) — source-checked `@sero-ai/app-runtime` hooks, bridge APIs, and widget registry.
- [Plugin Author Quick Path](/reference/plugin-author-quick-path) — practical path from package shape to extension, UI, runtime, and widgets.
- [Plugin Quickstart](/reference/plugin-quickstart) — canonical starter example and success criteria.
- [Plugin End-to-End Example](/reference/plugin-end-to-end-example) — larger example that includes UI, background runtime, widgets, and tools.

## Quality / safety / help

- [Coverage Audit](/reference/coverage-audit) — source-checked product coverage map for the public docs site.
- [Testing / Evals](/reference/testing-evals) — current quality model, smoke checks, promptfoo evals, cost/auth caveats, and scenario coverage.
- [Security / Privacy](/reference/security-privacy) — local-first posture, remote surfaces, safeguards, permissions, and sensitive state.
- [Troubleshooting](/reference/troubleshooting) — fixes for native modules, dev startup, containers, host mode, providers, and baseline reporting.
- [Known Limitations](/reference/known-limitations) — platform, runtime, product maturity, and distribution limitations.
- [Support Scope](/reference/support-scope) — supported alpha baseline, runtime support matrix, and issue-reporting expectations.

## Plugin catalog

- [Plugin Catalog](/plugins/catalog) — public catalog for built-in and external/local plugins, with selected dedicated plugin pages.
