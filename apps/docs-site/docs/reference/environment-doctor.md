# Environment Doctor

The Environment Doctor is Sero's built-in diagnostic subsystem. It audits the
host, the Sero runtime, and the active profile's on-disk state, then reports
each result as `pass`, `warn`, or `fail` alongside guidance for fixing
problems. The doctor is designed to keep working even when Sero itself
cannot finish booting.

For the implementation specification, see
[`docs/features/environment-doctor.md`](https://github.com/sero-labs/sero/blob/main/docs/features/environment-doctor.md).

## When to use it

Run the doctor when:

- a fresh install will not start cleanly,
- a profile or workspace looks corrupted,
- native modules (`node-pty`, `better-sqlite3`) fail to load after an
  Electron upgrade or interrupted `pnpm install`,
- you are about to file an issue and want a structured snapshot to attach.

Reports are deterministic — running the doctor twice in the same environment
produces the same JSON apart from the timestamp and per-check duration.

## Three entry points

All three share the same engine and check catalogue. Output is a typed
`DoctorReport`.

### 1. In-app panel

Opens the **Environment Doctor** panel inside Sero. Streams progress events
as each check completes. Use the panel's **Quick** button for a fast (≤ 2s)
scan or **Re-run** for the full pass (≤ 10s). Results can be exported as
JSON or copied to the clipboard.

### 2. Safe mode (`electron --doctor`)

Reaches the doctor when Sero cannot finish booting. The Electron host
short-circuits before any feature is initialised, profiles are read
defensively, and broken `profiles.json` files survive without crashing the
process. The renderer either renders a recovery-styled `DoctorPanel` or
prints JSON to stdout, depending on the flags used.

### 3. CLI shim (`sero-doctor`)

A small shell script bundled at
`Sero.app/Contents/Resources/sero-doctor`. It re-invokes the bundled
Electron binary with `--doctor`, so the CLI inherits the same
signing/notarisation as the rest of Sero. Sero may offer to symlink the
shim to `/usr/local/bin/sero-doctor` on first run; the symlink is
declined by default.

## CLI flags

```bash
electron --doctor [flags]
```

| Flag | Effect |
|---|---|
| `--doctor` | Required. Enters safe mode. |
| `--json` | Emit a `DoctorReport` JSON document on stdout. Logs go to stderr. |
| `--quick` | Use quick mode (≤ 2 s budget; skips slow checks). |
| `--profile <id\|path>` | Target a specific profile. |
| `--all-profiles` | Scan every registered profile (and orphans). |
| `--category <name>` | Run a single category (see below). |
| `--report <path>` | Write JSON to `<path>` instead of stdout. Implies `--json`. |
| `--no-window` | Do not open a renderer window (default when `--json` is set). |

Exit codes:

- `0` — all checks `pass` or `warn`.
- `1` — one or more checks `fail`.
- `2` — engine itself crashed (bug); stderr carries the stack.

## Check categories

| Category | Examples |
|---|---|
| `system` | OS, arch, free disk, free memory. |
| `runtime` | Apple Container (CLI, version, daemon), Docker if installed. |
| `node` | Node version, native ABI, `node-pty`, `better-sqlite3`. |
| `profile` | `profiles.json` parse, active profile id, per-profile config files. |
| `workspace` | Registry presence, runtime selection, FS reachability. |
| `providers` | Per-provider env-var presence and `any-usable` summary. |
| `plugins` | Manifest reachability, compatibility, sandboxed load. |
| `environment` | `PATH`/`HOME`/`SHELL` and recommended-var audit. |

The detailed list of stable check IDs lives in
[`docs/features/environment-doctor.md`](https://github.com/sero-labs/sero/blob/main/docs/features/environment-doctor.md#6-check-catalogue-v1).

## Privacy and redaction

The doctor is designed to be safe to share, but always treat reports as
developer-machine data. Specifically:

- Credential file readers (`auth.json`, `.env`) expose only the *names* of
  stored keys. Values are deleted in-memory before the parsed structure is
  returned.
- Profile paths are hashed (12-char SHA-256 prefix) before serialisation;
  raw paths never leave the process.
- A last-line-of-defence redactor scrubs sensitive field names
  (`value`, `secret`, `token`, `apiKey`, `password`, `cookie`,
  `authorization`), well-known credential patterns
  (`sk-…`, `Bearer …`, `ghp_…`, `github_pat_…`, 32+-char hex digests),
  and rewrites paths under your home directory to `~/...`.

If you spot a leak in a generated report, file an issue — the redactor is
a backstop and any leak that reaches it is a bug worth fixing.

## Repairs (v1)

Repairs are scaffolded but **not invocable in v1**. Failing rows show the
repair description with an *Auto-repair coming soon* affordance. Today
the supplied fixes are either manual instructions or copyable shell
commands (`pnpm rebuild better-sqlite3`, `container system start`, …).
Auto-repair execution will arrive in a follow-up release.

## See also

- [Troubleshooting](/reference/troubleshooting) — the broader fix guide
  the doctor complements.
- [State and Folders](/reference/state-and-folders) — what the per-profile
  checks inspect.
- [Containers and Host Mode](/reference/containers-host-mode) — context
  for the `runtime.container.*` checks.
- [Sero CLI](/reference/sero-cli) — the workspace/agent CLI that
  `sero-doctor` complements (the doctor is intentionally separate from
  `sero-cli`).
