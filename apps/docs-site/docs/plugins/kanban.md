# Kanban Plugin

Kanban runs an agent-assisted development board for a Git workspace. A card can move through **Backlog**, **Planning**, **In Progress**, **Review**, and **Done**.

## Before you start a card

Open a Git-backed workspace and select a model. Install and authenticate GitHub CLI if you want the plugin to create, close, or merge pull requests:

```bash
gh auth login
```

Create a small card in **Backlog**, then start it. Starting a card launches automated planning agents. Approval advances an accepted plan to implementation. The workflow can create a Git worktree and branch, run implementation and review agents, and create a pull request. Review the plan and repository changes before approval.

## Control automation

**YOLO Mode** can auto-start, auto-approve, and auto-complete work. **PR Auto-Merge** is available only with YOLO Mode and can queue GitHub auto-merge for new review pull requests. Enable these settings only when the repository and its branch protections can safely accept unattended changes.

Use **Request revisions** to return a review card to implementation. **Cancel PR** closes its GitHub pull request, requests branch deletion, removes local review artifacts and its worktree, and returns the card to Backlog. Cleanup can report warnings if Git cannot remove a worktree.

The `kanban` tool manages cards and workflow actions. `/kanban` opens the chat workflow. Use `sero help kanban` for the current terminal command syntax.

## State and recovery

The board is workspace-scoped at `<workspace>/.sero/apps/kanban/state.json`. Do not copy this file between repositories. If a phase fails, inspect the card error and error log before you use retry. Confirm the selected model, Git status, and `gh auth status` before you restart PR work.

## Related docs

- [Git Integration](/guide/git-integration)
- [Plugin Catalog](/plugins/catalog)
- [Security / Privacy](/reference/security-privacy)
