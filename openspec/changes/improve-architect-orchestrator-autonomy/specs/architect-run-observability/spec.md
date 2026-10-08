# Spec Delta

## ADDED Requirements

### Requirement: Execution comparisons hold outcomes and authority constant

Live comparison records SHALL identify candidate revision, strategy, task, initial workspace, user requirements, independent acceptance checks, actual model and reasoning settings, authorized capabilities and equivalent budgets. Strategies SHALL be free to choose different execution structures. A comparison MUST identify mismatched inputs and incomplete provenance instead of attributing their effects to strategy.

#### Scenario: Architect and a persistent single agent are compared
- **WHEN** the same task is run using current Architect and continuous single-agent execution
- **THEN** both start from equivalent workspace state and authorized resources with the same model, effort, requirements and budgets
- **AND** neither is forced to use the other's roster or workflow

#### Scenario: A delegate used an unknown model
- **WHEN** a candidate lacks actual delegate model or reasoning provenance
- **THEN** the comparison identifies that gap and cannot claim a controlled strategy effect from that pair

### Requirement: Comparisons record consequential outcomes

Comparison records SHALL retain accepted, rejected or incomplete outcome, acceptance evidence, user interventions, elapsed time, total known cost and coverage, repeated work, protocol failures and recovery results. Acceptance MUST come from the task's checks, not absence of dispatch failure. A record MUST NOT be compared with itself as evidence of an improvement.

#### Scenario: No dispatch exists
- **WHEN** direct work has no delegated failure but acceptance checks are missing or fail
- **THEN** the result is incomplete or rejected, never automatically accepted

#### Scenario: Operator rescues a run
- **WHEN** manual coaching, state repair or file transfer is needed
- **THEN** the intervention is recorded and that run does not establish unassisted completion

### Requirement: Performance claims require live comparable coverage

Evaluation SHALL cover a small fix, uncertain debugging, a substantial feature, collaborative research and interrupted execution through a bounded pilot with repeated comparisons. Reports SHALL retain mixed and failed results and identify unresolved variation. Synthetic measurements SHALL prove instrumentation only. Incomplete cost coverage MUST NOT support a total-cost saving claim, and fewer agents or tokens alone MUST NOT count as success.

#### Scenario: Historical measurements are partial
- **WHEN** retained baseline records lack full cost or acceptance coverage
- **THEN** they remain available with that classification and cannot establish savings over a single-agent baseline

#### Scenario: One phase has mixed results
- **WHEN** a change helps a debugging task but hinders a small fix
- **THEN** both results are reported, with outcome quality and necessary user intervention assessed before cost and time

#### Scenario: Run variation remains unresolved
- **WHEN** bounded repeated runs do not establish a reliable effect
- **THEN** the report states the uncertainty and does not claim a measured regression or improvement
