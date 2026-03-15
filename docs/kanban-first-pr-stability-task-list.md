# Kanban First-PR Stability Task List

Date: 2026-03-15

Context:
- Fresh repo `monobyte/helloworld1` ended up with GitHub default branch `feat/create-a-hello-world-app-3` instead of `main`.
- The local git history is sane: `main` contains the initial commit and the feature branch contains the card work.
- The broken remote default branch makes the repo UI look wrong and risks confusing PR/base-branch logic.
- Review-stage UX was also misleading because an open PR could look like a broken "Mark Done" action instead of an explicit "still waiting on merge" state.

Tasks:
- [x] Confirm the exact failure mode in the `helloworld1` workspace, local git history, kanban state, and GitHub repo metadata.
- [x] Fix GitHub repo creation so a brand-new repo pushes its initial branch when commits already exist, preventing the first feature branch push from becoming the remote default branch.
- [x] Harden kanban PR bootstrap so first-PR flows repair the remote default branch to `main` after creating/pushing it, even for repos already created in a bad state.
- [x] Keep review-stage PR status explicit in the UI so "still open" and "recheck" states are obvious.
- [x] Repair the current `helloworld1` repo/workspace state if needed and verify the resulting branch/default-branch/PR behavior.
- [x] Run verification (`pnpm typecheck` and targeted checks) and document residual risks.
