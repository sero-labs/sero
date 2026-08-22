---
name: sero-code-review
description: |
  Review a PR, a branch, or a diff in the Sero monorepo and post the findings.
  Use when the user asks to review code, review a PR, re-review after new
  commits, check a branch before merge, or double-check an earlier review.
  Trigger on phrases like "review this PR", "review the delta", "check the
  changes", "double check it", or any request that ends in review findings.
  Use this in place of the built-in code-review skill.
---

# Sero Code Review

Applies to every PR review, branch review, and delta re-review.

These rules exist because unverified findings and split review rounds waste more time than the review saves.

## 0. The goal is a green light

A review succeeds when the branch ships. It does not succeed by finding more
things. Each round must move towards a verdict, never away from one.

- Give a clear verdict every time: **green** (ship it) or **red** (do not ship, and here is exactly what blocks it). Never end a review with an open-ended list and no call.
- Only a correctness, data-loss, or security defect can hold a red light. Style, taste, "could be cleaner", and hypothetical edge cases never block a merge.
- Everything else is a **non-blocking note**. Say so plainly, in the same breath, so nobody has to guess whether it must be fixed.
- When the blocking findings are fixed, call it green. Do not replace them with a fresh tier of smaller findings you did not think worth raising before.
- Later rounds must shrink. If a re-review produces more blocking findings than the round before it, the earlier round was not done properly — say that instead of quietly extending the list.
- No finding at all is a valid and good result. Say "green, nothing found."
- The verdict covers the **code**. Merge blockers that are not code defects — the branch is behind its base, CI never ran, `packages/*` changed and needs republishing — go in their own short list under the verdict. Green code with an unmergeable branch is still green code; do not blur the two.

## 1. Verify before you report

- Read the mechanism in the source. Do not infer it. If a finding says "this function returns null", "A runs before B", or "this value is stale", open the file and read the lines that prove it.
- Quote the `file:line` you read, not the one you guessed.
- A finding you cannot prove goes in a separate **Suspected** list, marked unproven — or it is not reported. Never present an inferred cause as a fact.
- State what you ran (`pnpm typecheck`, test suites, line counts) and what you could not check. Never imply coverage you do not have.
- Green checks on a **draft** PR prove almost nothing. `.github/workflows/test.yml` skips `Detect changes`, `Fast checks` and `PR Gate` while the PR is a draft, so the rollup can read all-green with no tests run at all. Read the job conclusions (`gh pr view <pr> --json statusCheckRollup`) and treat `SKIPPED` as "not run". Run the touched suites locally and say so.

## 2. Sweep the fault class

- For every defect, search the sibling paths for the same pattern before you close it out. Error handling, guards, and races cluster: if one branch has no error surface, check the other branches in the same component.
- Do the same for every fix on a re-review. A fix can leave the identical gap in the path beside it, and can add a new fault.
- Re-read changed logic in full. A green test suite does not clear a concurrency or ordering change.

## 3. One review, one comment

- Post to the PR yourself as part of the job. Do not ask first.
- Keep **one** comment per PR. Update it with
  `gh pr comment <pr> --edit-last --create-if-none --body-file <file>`.
  Never stack a comment per round — the PR holds one current review, not a pile of rounds and corrections. `--edit-last` on its own fails when you have not commented on that PR yet, and it edits *your* last comment only, so a reply from someone else in between does not break it.
- A delta re-review opens with the status of every previous finding (fixed / not
  fixed / changed), then the new ones.
- Lead with the verdict, then the blocking findings, then the non-blocking notes.

## 4. Scope

- Review when the branch is ready, not on every push, unless asked for a mid-flight pass.
- Check type safety, the 500 LOC file limit, and whether `apps/docs-site` needs
  an update. Temporary prototypes must not remain on the merge branch.
- Do not let review feedback expand the PR scope beyond the users original goal. Address real shortcomings but avoid scope creep
