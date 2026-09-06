## Purpose

Architect establishes whether project results meet current requirements, confirms their delivery, and retains bounded maintenance responsibility with evidence that users can inspect.

## ADDED Requirements

### Requirement: Derive and preserve acceptance criteria

Architect SHALL derive observable acceptance criteria from the user's requirements and its recorded decisions before claiming acceptance. Criteria SHALL retain their origins and revision history. Required human judgment SHALL remain explicit. A failing criterion MUST NOT be silently weakened or removed to complete the project.

#### Scenario: Architect defines product-specific checks
- **WHEN** Architect develops the product from a brief
- **THEN** it records criteria that cover the explicit request and its own working commitments
- **AND** those additional commitments are not presented as original user requirements

#### Scenario: A criterion requires user judgment
- **WHEN** a result needs subjective evaluation that automated checks cannot establish
- **THEN** Architect presents the result and a focused feedback request without claiming that tests resolved that judgment

### Requirement: Bind acceptance to current evidence

The system SHALL associate evidence with the criterion, checked code or artifact revision, method, result, producer, and time. It SHALL distinguish reported completion, verified behavior, accepted results, and confirmed release. Required verification that cannot run SHALL remain unverified.

#### Scenario: An executor reports success without proof
- **WHEN** a worker reports completion but required evidence is missing or failed
- **THEN** Architect retains the report and keeps acceptance pending or failed

#### Scenario: Evidence becomes stale
- **WHEN** an affected requirement or checked artifact changes
- **THEN** the previous evidence no longer establishes acceptance until it is reassessed against the current revision

#### Scenario: A delivered artifact has not been verified
- **WHEN** a receipt confirms a PR or artifact exists but required behavior checks are incomplete
- **THEN** the interface distinguishes delivery evidence from product acceptance

### Requirement: Confirm delivery under current authority

Architect SHALL deliver the accepted result to the selected destination within granted authority and confirm the observed result. Delivery SHALL refer to the accepted revision. A failed or interrupted delivery SHALL preserve the accepted artifact and expose the delivery state. The system MUST NOT blindly repeat an uncertain external action.

#### Scenario: The release candidate changes
- **WHEN** the artifact to be delivered differs from the accepted revision
- **THEN** Architect re-establishes the affected acceptance and authority before delivery

#### Scenario: Delivery is interrupted
- **WHEN** an external operation may have completed but its acknowledgement is lost
- **THEN** Architect observes the destination where possible or requests resolution before retrying

#### Scenario: Delivery fails after acceptance
- **WHEN** the destination rejects delivery
- **THEN** the project retains its accepted result and shows failed delivery with a next action or required input

### Requirement: Maintain the product within an agreed mandate

After release, Architect SHALL retain the agreed maintenance responsibilities, allowed changes, triggers, and budget. Relevant signals SHALL create or attach to project work and use the same steering, acceptance, and delivery requirements. Work outside the mandate SHALL require new direction or authority.

#### Scenario: A maintained product develops a defect
- **WHEN** a qualifying defect report or check failure arrives
- **THEN** Architect relates it to the product and release, investigates it, and manages an authorized correction through verification and delivery

#### Scenario: A maintenance event is repeated
- **WHEN** the same unresolved problem is reported again
- **THEN** it attaches to existing work rather than starting a duplicate correction

#### Scenario: Monitoring has no actionable change
- **WHEN** a maintenance check finds no work within the mandate
- **THEN** Architect returns to quiet monitoring without inventing improvement work

### Requirement: Evaluate the full ownership cycle from an unchanged input

The first live evaluation SHALL give Architect the following input without added product decisions:

> **Turn-Based Roguelike Dungeon in Canvas/DOM**
> A mini tile-based dungeon crawler featuring procedural room generation, FOV raycasting (fog of war), deterministic turn steps, and enemy pathfinding (A\*). Be as creative as you like.

Architect SHALL determine the product direction and appropriate research, plan, criteria, execution, and delivery within available authority. Evaluation SHALL cover both the resulting product and ownership through a maintenance change. A specific title, theme, team, milestone sequence, or use of every Sero capability MUST NOT be required to pass.

#### Scenario: The baseline trial starts
- **WHEN** the evaluator launches the project
- **THEN** the initial product request matches the input above
- **AND** prototype examples or evaluator-authored game decisions are not injected as requirements

#### Scenario: Ownership is exercised under disruption
- **WHEN** the trial includes user direction during active work, interrupted execution, an unavailable capability, duplicate maintenance input, and a reproducible defect
- **THEN** the evaluation records how Architect handled each case, with actual evidence, human interventions, known cost, and unresolved limitations

### Requirement: Use an uncontaminated profile for live evaluation

Live Architect development and the first evaluation SHALL use a dedicated clean Sero profile created manually by the user and fresh trial workspace state. The setup process SHALL ask the user to create the profile and provide its location, then verify that location before live work. Existing profiles and work SHALL remain intact. Reuse of credentials or preferences SHALL be deliberate and recorded. Machine-shared toolchains SHALL remain reusable without importing old project content.

#### Scenario: The live environment is prepared
- **WHEN** the user creates the dedicated profile, provides its location, and selects it
- **THEN** its registered identity and active data root are verified against that location and required provider onboarding is completed
- **AND** old sessions, memory, project records, schedules, graph indexes, and workspace app state are absent from the trial context

#### Scenario: A proposed workspace contains earlier app state
- **WHEN** a candidate trial workspace contains state from prior work
- **THEN** the trial uses a fresh workspace instead of treating the new profile alone as proof of isolation

### Requirement: Report evaluation boundaries honestly

The evaluation SHALL distinguish deterministic runtime checks, rendered interaction checks, live agent results, and human review. Passing one category MUST NOT imply success in another. A feature-complete planning document or prototype MUST NOT be reported as an implemented Architect.

#### Scenario: Runtime tests pass but no live delivery has occurred
- **WHEN** deterministic checks pass before the live trial
- **THEN** the report states that the runtime contracts passed and leaves autonomous delivery and maintenance unproven
