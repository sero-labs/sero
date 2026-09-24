---
name: prune-tests
description: Audit brittle or tautological tests and, when cleanup is authorized, delete or rewrite them around independently specified behavior.
---

# Prune tests

Recommend `DELETE` by default for suspect tests. A test earns survival only when it proves consequential behavior through a stable seam. Rewriting is an exception, not a compromise. A disposition alone does not authorize an edit.

## Set the boundary

Pin the scope from the user's request: a diff, pull request, path, suite, issue, or the whole repository. Keep that boundary fixed and resolve the mode from existing authorization:

- **Audit:** Requests to inspect, find, review, or recommend are read-only. Report dispositions and evidence; do not delete or rewrite tests.
- **Cleanup:** Requests to prune, delete, rewrite, or implement approved dispositions authorize the corresponding scoped edits. Do not ask again for authorization already provided.

If a consequential scope decision remains unresolved, continue independent inspection and ask one focused question before affected edits. A skill invocation alone does not turn an audit into cleanup.

Read the instructions, test configuration, and approved product or engineering requirements that govern the scoped tests. When those sources conflict with this policy, report the conflict instead of choosing whichever rule makes cleanup easier.

Classify individual tests, not whole files. During cleanup, remove a file only after every test in it has a disposition.

## The behavioral bar

A test is worth keeping when all of these are true:

1. It proves an exact behavior established by an approved requirement, bug, accessibility rule, worked example, or other independent source.
2. It detects a recognizable user-visible or caller-visible failure.
3. Its expected result is independent of the implementation.
4. It observes behavior through a public interface or stable seam.
5. It survives internal refactors and changes to incidental copy or layout.
6. It uses the lowest stable seam that provides the needed confidence and does not duplicate nearby coverage.

Use the lowest stable seam that can prove the behavior. Put pure rules in domain tests, orchestration and authorization outcomes in application tests, interaction contracts in component tests, and only critical user workflows in end-to-end tests.

## What to prune

### Tautologies

A tautological test derives the expected value by restating the production calculation, asserting a declaration against itself, or confirming that a stub returns the value the test arranged. It passes by construction because the expected and actual results share the same source.

An expected value must be able to disagree with the implementation. Use an independently known result when a real behavior deserves coverage. Otherwise recommend deletion, applying it only in cleanup mode.

### Change detectors

A change-detector test fails when code or presentation changes, without identifying a behavior that became wrong. Common forms include:

- source scans for imports, identifiers, files, or declarations
- counts of wrappers, elements, routes, exports, or inventory rows
- snapshots of generated markup, component trees, class strings, or other implementation structure
- assertions about private collaborators or incidental call shape
- duplicated assertions whose only added value is noticing that something changed

Recommend deleting these tests. If a real contract is hidden inside one, recommend the smallest behavioral replacement that can fail for the contract itself; apply it only in cleanup mode.

### Geometry and appearance

Treat dimensions, ratios, coordinates, computed styles, layout-specific classes, mounted-row counts, and generic overflow measurements as appearance evidence, not automated behavior. Review screenshots or design evidence manually when visual comparison is required.

A viewport may set desktop or mobile context for a behavioral test. The assertion must complete a concrete user task. For example, prove that a user can reach and operate an action at a mobile viewport rather than comparing widths or `scrollWidth`.

Screenshot assertions enter the suite only when the project has deliberately adopted visual-regression testing as a requirement. Ordinary screenshots remain review evidence.

### Copy

Use roles, accessible names, and labels to find and operate controls. These names are part of the interface used by people and assistive technology, even though an intentional label change may require updating the test.

Assert exact prose only when the wording itself is an approved requirement. Otherwise verify the role, state change, retained data, navigation, reason code, or other observable outcome. Do not repeat a selector's accessible name as a content assertion.

### Focus and disabled state

Keep focus and disabled-state coverage only when that state is the interaction contract. Consequential examples include moving focus to the first invalid field, restoring focus after a dialog closes, and enabling Save after a semantic edit while disabling it again when the value returns to its normalized baseline.

Cover a normalization matrix in pure domain tests. Keep one representative component test for the resulting control behavior. Repeat it end to end only when that state is essential to completing the critical workflow.

Recommend deleting assertions that merely confirm a rendered prop, or that an element remains focused after no consequential event.

## Decide each candidate

Search broadly for likely candidates, then read each test with the production interface and governing requirement. Regex matches and snapshots of syntax are leads, not verdicts.

Assign one disposition:

- `DELETE` when the test violates this policy and no behavior would become meaningfully unprotected.
- `REWRITE` when an unacceptable test contains a behavior that passes the strong-justification gate below.
- `KEEP` when a suspicious test proves acceptable behavior and passes the same gate without changes.

Keeping or rewriting requires a written justification with evidence for every numbered item in the behavioral bar. Missing any item means the justification is weak. Recommend `DELETE` instead.

When rewriting, keep only the setup, action, and assertions needed to prove the named behavior. Do not preserve the old test's size, assertion count, fixture shape, or test level.

## Apply authorized cleanup

In audit mode, stop at the report; cleanup validation and removal of support code do not apply. In cleanup mode, delete or rewrite the classified tests within the authorized scope. Clean up imports, fixtures, helpers, snapshots, screenshots, and setup code left unused by those decisions. Do not change production behavior merely to preserve a test, and do not weaken unrelated behavioral coverage or test configuration.

Run the smallest relevant test command first, then every validation command required by the repository. A coverage threshold or test-count check does not justify replacement change-detector tests. Report the failed gate and the policy conflict if meaningful behavioral tests cannot satisfy it.

Inspect the final diff. The prune is complete only when every scoped candidate has one disposition, every survivor passes the behavioral bar, all dead test support is gone, and validation results are known.

## Report

State whether the result is an audit recommendation or completed cleanup. List every `DELETE`, `REWRITE`, and `KEEP` with its path and reason. Include the full strong justification for every `KEEP` and `REWRITE`, the commands run, failures, and any policy conflict. State explicitly when no acceptable rewrite existed.
