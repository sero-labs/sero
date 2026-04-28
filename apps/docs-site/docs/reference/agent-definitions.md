# Agent Definitions Reference

Agent definitions are profile-scoped Markdown files that describe named subagents. The Markdown body becomes the subagent system prompt; JSON frontmatter supplies metadata such as name, description, model, thinking, and timeout.

Source checked: `apps/desktop/electron/features/subagent/runtime/discovery.ts`, `apps/desktop/src/types/subagent.ts`, `docs/specs/subagents.md`, and `docs/features/subagents.md`.

## Location

Sero reads `.md` files from:

```text
<SERO_HOME>/agent/agents/
```

Default profile example:

```text
~/.sero-ui/agent/agents/
```

Definitions are discovered fresh when used, so a newly saved Markdown file can become available without a separate docs-site build or plugin install.

## Supported frontmatter forms

Sero accepts JSON in either a fenced `json` block or `---` delimiters.

### Fenced JSON form

````md
```json
{
  "name": "migration-reviewer",
  "description": "Reviews database migrations for safety",
  "model": "high",
  "thinking": "medium",
  "timeoutMs": 600000
}
```

You are a database migration reviewer. Inspect schema changes, data-loss risk,
rollback paths, and test coverage. Report findings before suggesting edits.
````

### Delimited JSON form

```md
---
{
  "name": "docs-scout",
  "description": "Maps documentation files before a docs edit",
  "model": { "prefer": "medium", "fallbacks": ["high", "low"] }
}
---

You find relevant docs, summarize current wording, and identify consistency risks.
```

## Fields

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `name` | Yes | string | Agent name. Use simple names that are easy to request from chat. |
| `description` | Yes | string | Short explanation of what the agent does. Used for discovery/listing. |
| `model` | No | string or structured object | Can be a model ID/tier alias string, or `{ "prefer": string, "fallbacks": string[] }`. |
| `thinking` | No | string | Thinking level override when supported by the resolved model. |
| `timeoutMs` | No | number | Per-run timeout in milliseconds. |
| `tools` | No | string[] | Parsed but ignored in v1; do not rely on it for tool restriction. |
| `extensions` | No | unknown | Warned/ignored in v1. |

Unknown or invalid models can warn, but structured model resolution happens when the agent runs.

## Model, thinking, and timeout precedence

When a subagent run resolves model-like settings, source docs describe this order:

1. Per-task override.
2. Top-level subagent call override.
3. Agent definition frontmatter.
4. Global subagent settings in `<SERO_HOME>/agent/settings.json`.
5. Current session/default model behavior.

Do not assume a definition always forces the exact model if provider credentials, model availability, or tier mappings differ by profile.

## Global settings

Global subagent settings live in the active profile settings file:

```text
<SERO_HOME>/agent/settings.json
```

Source docs describe settings such as `maxConcurrent`, `maxTotal`, `timeoutMs`, `model`, and `thinking`. Treat this as profile-local configuration and redact it if it contains private workflow details.

## Child-session boundaries

Subagents run as child sessions with important constraints:

- They do not receive `subagent` or `create_agent` tools.
- They cannot recursively spawn more subagents.
- External extension packages are not loaded in subagent sessions in v1.
- They share the workspace runtime; parallel agents should avoid overlapping writes.
- The `tools` frontmatter field is not an enforced permission system in v1.

## Troubleshooting definitions

| Symptom | Check |
| --- | --- |
| Agent does not appear | File ends with `.md` and lives in `<SERO_HOME>/agent/agents/`. |
| Definition is skipped | Frontmatter must be valid JSON and include `name` and `description`. |
| Model warning appears | The model ID may not exist in the active registry or provider credentials may be missing. |
| Tool restriction did not apply | `tools` is parsed but ignored in v1. |
| Child agent cannot create another agent | This is expected; recursion and agent management are disabled in children. |

## Related docs

- [Subagents and Collaboration](/guide/subagents)
- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Models and Providers](/guide/models-and-providers)
- [State and Folders](/reference/state-and-folders)
