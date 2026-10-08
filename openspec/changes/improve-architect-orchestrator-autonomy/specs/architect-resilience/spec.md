# Spec Delta

## MODIFIED Requirements

### Requirement: Efficiency preserves independent judgment

An implementer SHALL be able to investigate, edit and run development tests without its self-check being represented as independent acceptance. Independent review SHALL remain available and SHALL be required when the user or task requires it; otherwise Architect SHALL choose it when findings justify the extra work, without a compulsory reviewer for every task. When performed, independent evaluation SHALL inspect approved requirements and actual results without inheriting the implementer's reasoning trace. If a reviewer modifies product behavior, those modifications SHALL remain subject to independent judgment. Repair SHALL preserve valid work and use precise findings; re-review SHALL focus on those findings and directly affected behavior unless evidence requires broader checks. Runtime-owned evidence and Architect acceptance MUST remain mandatory for every execution approach.

#### Scenario: Implementer's tests pass
- **WHEN** an implementer reports passing tests but independent evaluation finds missing required behavior
- **THEN** Architect does not accept the milestone and the missing behavior remains a repair finding

#### Scenario: Focused repair
- **WHEN** a repair addresses a named review finding without invalidating unrelated evidence
- **THEN** the next review checks the finding and its direct effects rather than requiring a fresh whole-project investigation

#### Scenario: Reviewer edits the product
- **WHEN** a reviewer fixes a product defect itself
- **THEN** its own fix is not labelled independently verified solely by that reviewer's claim

#### Scenario: The user requires independent review
- **WHEN** the user requires an independent reviewer for a direct execution task
- **THEN** passing owner self-checks do not satisfy that requirement and the required review runs before acceptance

#### Scenario: A small task does not require a reviewer
- **WHEN** no user or task requirement mandates independent review and Architect finds no reason to add it
- **THEN** runtime-produced evidence can support acceptance without another agent
- **AND** the result is not labelled independently reviewed
