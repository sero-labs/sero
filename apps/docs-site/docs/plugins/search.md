# Search

The Search plugin gives your agent indexed file and content search. It is built
in and enabled by default, so there is nothing to install.

## What the agent gets

| Tool | What it does |
|---|---|
| `find` | Finds files by a fuzzy path query or a glob. It matches the whole path, not only the filename. |
| `grep` | Searches file contents. It selects case sensitivity automatically and detects a regular expression. |
| `multi_grep` | Searches for several words at the same time. Use it for the different spellings of one name. |

Results are grouped by file and ranked. Files that you changed recently, and
files with uncommitted git changes, come first.

## Ranked results, not all results

The search index gives the agent the most relevant matches, not every match. It
is made for exploration: to find where a feature lives, or which file to read
first.

When the agent must find every occurrence — for an audit, a migration, a
security review, or a repository-wide rename — it uses `bash` with `rg`
instead. The tools tell the agent this, and `bash` stays available.

## Where it searches

Search covers the workspace or worktree that the session is open in. A path
outside the workspace is refused, and the agent is told to use `bash` for it.
Your home directory and the Sero agent directory are never indexed.

Sessions on the same workspace share one index. A chat, its subagents, and Room
members do not each build their own.

## Ranking data

Sero stores how often you open and change each file, in your profile directory
(`~/.sero-ui/agent/fff/`). This data stays on your machine. A second profile
does not see the first profile's ranking.

## If the index is not available

Search never stops a session from opening. If the index cannot be built, the
tools return an error that says why and tells the agent to use `bash` with `rg`.

## Related

- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Plugins and Apps](/guide/plugins-and-apps)
