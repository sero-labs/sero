# Output Optimizer

The output optimizer is an optional built-in plugin. It reduces the shell output that reaches the model without deleting anything: complete output stays in capture files.

Output optimisation is **disabled for a new profile**. Enable it in the plugin's settings surface. Disable it again to return to unmodified commands and results; no restart is needed.

## Command rewriting

When optimisation is enabled, Sero asks the pinned RTK for an equivalent of each supported shell command. If RTK offers one, Sero runs the RTK form bound to the verified runtime executable. If RTK is unavailable, declines the command, fails, or does not answer in time, the original command runs unchanged.

Sero does not rewrite these commands:

- Search commands (`grep`, `rg`, `find`), including a search command inside a pipe or a compound command. RTK abbreviates paths and truncates matched lines, which breaks the search-then-edit loop.
- Lossy Git history and diff forms: `git log`, `git diff`, `git show`. RTK truncates commit messages and hunks.
- Any command with a top-level pipe on Windows.
- Commands that request machine-readable output, such as `--json` or `--porcelain`.
- A command that ends with the bypass marker.

RTK exit codes 0 and 3 are rewrite candidates, 1 means no equivalent, and 2 means RTK declined. Sero uses these only to choose a command. They do not grant or bypass Sero permission checks.

A result for a rewritten command records both the requested command and the executed one. Open the **Full details** viewer for a result to see them. The model is not told about the rewrite: it receives the command it asked for and that command's output, and the executed form stays in the result details. The recorded form is the RTK command, such as `rtk pnpm install`; the resolved RTK executable and its session state paths are not persisted.

## Compaction

For complete captures, Sero compacts these categories before it builds the preview:

- Test runs, keeping failures and the summary.
- Builds and type checks, filtering progress around errors and warnings.
- Linters, grouped by file with their counts.
- Git status and log, keeping every path, commit identifier and full commit message.
- Package-manager progress, keeping errors.

A category rule never removes an error, warning, file path, line number, commit identifier, commit message or matched line from the complete candidate. If a rule cannot prove an omission is safe, Sero keeps the source text. Output that matches no category reaches the model unchanged.

## Bounded previews and complete capture files

The model receives a bounded preview: 2,000 lines or 50 KB, whichever comes first. The preview is not guaranteed to contain every diagnostic, and it is not promised to be parseable when it is truncated.

The **complete** output stays in capture files. While the model payload leaves anything out, the result reports the capture paths and sizes so the agent can read them with its file tools. When the payload already carries the complete output and nothing was omitted, the optimizer omits that report: on a short result it would cost more context than the output it describes. The complete output stays openable from the result either way. A stream file that holds the same bytes as the combined output is not listed separately.

A large capture can need paged reads or local processing, because file reads have their own limits.

To open a capture in the UI, select its file in the tool result. It opens in the **Tool Details** viewer, which states whether the model received all of the output or a bounded preview, and shows one page at a time. The tool result itself carries the file control only: nothing is rendered inline, so a tool call never accumulates a log. A capture lives outside every workspace, so the viewer uses its own read contract instead of the editor's workspace path policy.

### Structured output

Commands that request machine-readable output bypass RTK rewriting and all content filtering. Their captured stdout and stderr files are byte-exact, and reporting text is never inserted into them.

If stdout fits both limits, the payload contains the exact document. If it does not, the payload is a bounded preview that is explicitly marked incomplete, and the stdout capture file holds the whole document. An invalid document stays invalid; Sero does not repair it.

## Per-class switches

Each class of rewritten command has its own switch: file reads, Git, containers, GitHub, tests, builds and type checks, package managers, and other. If any affected class is disabled, Sero discards the whole rewrite and runs the original command.

## Bypass one command

Add a trailing `# no-opt` comment to skip optimisation for one command:

```bash
git status --short # no-opt
```

That command is neither rewritten nor compacted. Later commands stay optimised.

## Session savings

The settings surface reports the plugin's own compaction: total removed bytes divided by total measured input bytes. The figure is the complete captured shell output before the preview limit, after RTK filtering. It is not RTK savings and not a billing change.

Calls with a complete capture enter the totals, including calls whose output did not change. Calls without a complete capture count as unmeasured and are excluded from the totals. A command that completes with zero output counts as measured zero input and output bytes.

## Settings session

The settings surface runs in its own app session. That session runs no shell commands, so it holds no accounting and resolves no RTK itself. The chat session publishes its savings and the current RTK status to `state/output-optimizer/status.json` in the profile state directory, and the settings session reads that file. A savings-figure write and an RTK-write merge into the file, so one does not erase the other. When the file is absent, the surface shows the reader's own values.

The **Retry** action asks the workspace runtime for the verified RTK locations again. A failed probe leaves the reported reason in place; it does not change command execution.

## Related

- [State and Folders](/reference/state-and-folders) — capture storage, host RTK state, and retention.
- [Security / Privacy](/reference/security-privacy) — sensitive data in captures.
