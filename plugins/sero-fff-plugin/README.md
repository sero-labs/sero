# @sero-ai/plugin-fff

Ranked file and content search for Sero agents, backed by
[FFF](https://github.com/dmtrKovalenko/fff).

Sero disables Pi's built-in search tools, so agents reach for `bash` with `rg`
or `find` for every lookup: a subprocess per search, and unranked output the
model has to read in full. This plugin gives them three indexed tools instead.

## Tools

| Tool | Use |
|---|---|
| `find` | Fuzzy path and glob search. Matches the whole workspace-relative path, not just the filename. |
| `grep` | Indexed content search. Smart-case, auto-detects regex versus literal, falls back to fuzzy matching when an exact search finds nothing. |
| `multi_grep` | One pass over several literal patterns (OR) — the naming-convention variants of one identifier in a single call. |

All three are read-only, bounded, frecency-ranked, git-aware, and paginated by
an opaque cursor.

## Ranked, not exhaustive

The tools return the most relevant matches, not every match. Their descriptions
and prompt guidance say so, and point the model at `bash` with `rg` whenever
completeness is the requirement — audits, migrations, security review,
repository-wide refactors. `bash` stays the escape hatch; nothing here replaces
it.

## Index lifecycle

One index per effective workspace or worktree root, shared by every session in
the process — the chat, its subagents, Room members, app and persistent
sessions. Sessions reference-count the index; the finder and its watcher are
destroyed when the last one releases it, and concurrent first searches on one
root coalesce into a single scan. Frecency and query history are
**profile**-scoped, under the agent directory `SERO_HOME` /
`PI_CODING_AGENT_DIR` resolves to.

## Confinement

Every supplied path is normalised and checked against the session's root before
it reaches the engine. Absolute paths inside the workspace are rebased;
absolute paths outside it, `~/`, and `../` traversal are rejected with a message
naming the workspace and the `bash` fallback. The upstream `pi-fff` behaviour of
spawning auxiliary indexes for out-of-workspace paths is deliberately not
carried across. The filesystem root, the home directory, and Sero's own agent
directory are never indexed.

## Failure

An unavailable native binary, a failed scan, or a corrupt frecency database
never blocks a session from opening. A frecency failure drops to a
database-less index (ranking is lost, search is not). Anything worse surfaces
as a tool error that names the reason and directs the agent to `bash` with `rg`.

## Development

```bash
pnpm --filter @sero-ai/plugin-fff typecheck
pnpm --filter @sero-ai/plugin-fff test
pnpm --filter @sero-ai/plugin-fff bench -- --repo /path/to/repo
```

The engine-correctness suite runs the real native library against `rg` on a
generated fixture tree and skips itself when either is unavailable. See
`bench/README.md` for the A/B benchmark and its recorded run.

## Packaging

The engine is a Rust cdylib loaded through `ffi-rs`, so `@ff-labs/fff-node`
stays external to the bundled extension (`sero.plugin.extensionExternals`) and
its native paths are unpacked from the asar (`asarUnpack` in
`apps/desktop/electron-builder.yml`). The per-platform binary package is the one
npm installs for the build host, so each release target ships its own.

## Attribution

Parts of the TypeScript integration are adapted from `@ff-labs/pi-fff` (MIT).
See [NOTICE.md](./NOTICE.md). The FFF Rust engine is a dependency, not a fork.
