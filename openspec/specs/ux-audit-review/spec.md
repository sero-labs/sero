## Purpose

Provide traceable screenshots of Sero's Architect, Orchestrator, Rooms and Workspace pages, a coverage register that shows what was not captured and why, and static proposed designs kept separate from that evidence, so the user can decide what to change.

## Requirements

### Requirement: Explicit page and state coverage

The audit SHALL inventory Architect, Orchestrator including Goals, Library and Catalog, Rooms, and Workspace management pages. It SHALL include relevant dialogs, disclosures, long-content and lifecycle states. Each entry MUST identify the user task and be marked captured, duplicate, or gap. A gap MUST carry a reason. Coverage MUST be reported as partial while gaps remain.

#### Scenario: A required state is unavailable
- **WHEN** an applicable state cannot be reached without spending money or changing the source data
- **THEN** the register and the evidence document show the missing entry and its reason
- **AND** the audit is reported as partial until the gap is resolved or its exclusion is accepted

#### Scenario: A long page requires several images
- **WHEN** a page extends below the initial viewport
- **THEN** the evidence includes the initial viewport and separately identified scrolled views
- **AND** a scrolled view does not replace evidence of what the user sees first

### Requirement: Capture without waking the product

Capture SHALL run against a copy of the source profile with the Architect, Rooms and Goals runtimes disabled, so no owner is woken, no model is called and no record is written. The source profile and workspaces MUST remain unchanged. Any screen whose content is supplied by a disabled runtime MUST be labelled as such, so a capture-mode artefact is not read as a product defect.

#### Scenario: A runtime-fed panel is empty under capture
- **WHEN** a panel reports that a runtime is not running because the capture disabled it
- **THEN** the register labels that frame as a capture-mode artefact
- **AND** the finding list does not treat it as a product defect

### Requirement: Evidence identity and honest duplicates

Each capture SHALL carry a stable id, area, page, state, user task, capture time, viewport width, a text fingerprint of the rendered panel and a content hash of the image. Two captures with the same content hash MUST be recorded as one image with the later entry marked a duplicate. Original captures MUST NOT be edited to look better.

#### Scenario: Two states render the same frame
- **WHEN** two register entries produce byte-identical images
- **THEN** the second entry is marked a duplicate of the first and adds no second image
- **AND** the coverage count does not rise because of it

#### Scenario: Navigation lands on the wrong screen
- **WHEN** a deep link is overridden by a restored route
- **THEN** the walk reads the opened heading back and labels the capture with the screen actually shown
- **AND** a frame that does not match its intended state is not published as that state

### Requirement: Existing content first, bounded runs second

Capture SHALL reuse existing records before starting anything. A new run SHALL only address a named register gap, use one small task with explicit cost, time and attempt bounds and a stop condition, and record purpose, effective models, elapsed time and reported cost. Every new run and delegated member MUST use `openai-codex/gpt-5.6-luna:high`, and the effective owner, planner, workflow-step and Room-member selections MUST be checked before dispatch.

#### Scenario: Existing content covers a required state
- **WHEN** a required state is available in existing records
- **THEN** the audit reuses that content instead of starting a run to recreate it

#### Scenario: The required model cannot be enforced
- **WHEN** Luna at high effort cannot be selected for every participant
- **THEN** the run does not start and the audit reports the blocker without substituting a model

#### Scenario: Cost is not reported
- **WHEN** a run finishes without a usable cost figure
- **THEN** the audit records the cost as unknown rather than as zero

### Requirement: Static evidence and static proposals, kept apart

The audit SHALL deliver two static HTML documents in the style of the existing Sero prototypes: one showing captured frames with the observed problem, and one showing proposed designs as static mockups. Both SHALL be reachable from the styleguide archive and SHALL run without a remote service or CDN. Neither SHALL be an interactive review application, an annotation editor, or store review state. A proposed design MUST NOT appear inside the evidence document.

#### Scenario: A reader opens the evidence document
- **WHEN** the reader reaches a numbered state
- **THEN** they see the captured frame, the state it shows and the observed problem
- **AND** they do not see a proposed replacement presented as the current product

#### Scenario: A reader opens the proposals document
- **WHEN** the reader reaches a proposed design
- **THEN** it is drawn in the product's current theme and density
- **AND** it shows only controls the proposal supports

### Requirement: Findings support decisions without prescribing a redesign

Findings SHALL link to a register id, identify the affected task, and separate the observed problem from the proposed remedy. The audit SHALL assess information priority, repeated text, agent instructions used as user-facing headings, card and panel density, scroll burden, progressive disclosure and data-state meaning. The current theme is a constraint. Truncation and character limits MUST NOT be proposed as the remedy; long content SHALL be given headings, bullets, ordered steps, labelled evidence or acceptance criteria, with full detail available on demand.

#### Scenario: Output has not been generated yet
- **WHEN** a page warns about output that does not exist yet
- **THEN** the finding separates that state from a failed operation and proposes a distinction
- **AND** it does not hide a genuinely actionable fault

#### Scenario: Long detail is already readable
- **WHEN** labelled rows or structured text inside a disclosure help the reader
- **THEN** the audit records that as a pattern to keep, without requiring all long content to be visible by default

### Requirement: At-a-glance activity and honest progress

The audit SHALL assess whether an overview row and a main page make current work clear before any disclosure or detail navigation. It SHALL distinguish owner activity from delegated Workflow and Room activity, including a paused owner whose workers continue. It SHALL evaluate working, queued, waiting-for-user, paused, complete, failed and unconfirmed states, and whether each survives without colour or motion. Findings SHALL separate known completed work from liveness and from update freshness, and MUST NOT propose invented percentages or ETAs. An old update alone MUST NOT be treated as proof of failure or of continued execution. This change MUST NOT implement production indicators.

#### Scenario: The owner is paused while a worker continues
- **WHEN** a Workflow or Room is working while its Architect owner is paused
- **THEN** the audit captures the overview row and the main page and records whether the user can see the continuing delegated work without opening detail

#### Scenario: Total work is unknown
- **WHEN** an active task has no reliable total
- **THEN** the audit judges named activity and known completed work, and does not treat animation, elapsed time or step counts as a percentage of total duration

#### Scenario: Reduced motion is enabled
- **WHEN** animation is disabled through the reduced-motion preference
- **THEN** the audit checks whether the state and any required user action remain readable from text and static marks

### Requirement: Transition evidence states what it proves

Activity findings SHALL use timestamped before/after captures linked by a transition id, with a short observation and the known underlying state. Each pair MUST be labelled live, replayed or fixture-driven. Static or simulated evidence MUST NOT be presented as proof of live update delivery, and an unobserved transition SHALL remain an explicit gap.

#### Scenario: No transition could be observed live
- **WHEN** the capture ran with the runtimes disabled, so no state changed during it
- **THEN** every transition in the coverage list is marked a gap with that reason
- **AND** the evidence document does not imply that any indicator was seen to update
