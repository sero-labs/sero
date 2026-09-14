## Purpose

Let users choose project-specific model tiers for Architect and its delegated work without changing global defaults or widening runtime permissions.

## ADDED Requirements

### Requirement: Project tier overrides inherit global defaults
Architect SHALL let the user override the model and supported thinking level for each LOW, MED and HIGH tier on an individual project. A tier without a project override SHALL inherit its global selection. Clearing an override SHALL restore inheritance. These settings SHALL persist in the active profile and MUST NOT change another project's or the global model settings. The feature MUST NOT introduce a separate permitted-model pool.

#### Scenario: One overridden tier
- **WHEN** the user overrides only MED for project A
- **THEN** A resolves MED from its project selection and LOW and HIGH from global settings
- **AND** project B and global settings remain unchanged

#### Scenario: Restore inheritance
- **WHEN** the user clears a saved HIGH override and restarts Sero
- **THEN** the project uses the global HIGH selection for newly resolved work

### Requirement: Project selections reach all delegated model work
Effective project defaults SHALL apply to owner turns, Room and Workflow planning, research, workers, repair, trigger inference, auxiliary evaluation and model-based verification. A new delegated Room or Workflow SHALL retain a snapshot of the effective defaults before planning starts. Its subsequent calls SHALL use that snapshot rather than silently resolving against changed global defaults. Room and Workflow planners SHALL continue to choose assignments dynamically.

#### Scenario: Planning precedes workers
- **WHEN** an Architect with an overridden MED tier creates a Workflow
- **THEN** both its MED planning calls and its MED workers use the project selection
- **AND** supporting MED calls do not silently revert to the global model

#### Scenario: Room assignment
- **WHEN** Architect delegates collaborative planning to a Room
- **THEN** the Room receives model choices derived from the project defaults before planning its members
- **AND** the Room still decides which members and assignments suit the objective

### Requirement: Explicit selections retain precedence and provenance
Existing explicit manual step model overrides SHALL remain available and take precedence over tier defaults within existing permission checks. The existing explicit owner environment override SHALL remain distinguishable from tier settings. The UI and run records SHALL distinguish requested tier or explicit selection, effective provider/model, thinking level and selection source. A tier label alone MUST NOT stand in for the actual model used.

#### Scenario: Manually pinned step
- **WHEN** the user pins an authorized model on a Workflow step whose project MED default differs
- **THEN** that step uses its explicit selection
- **AND** the inspector identifies the manual override and actual model

#### Scenario: Owner environment pin
- **WHEN** an explicit owner environment override takes precedence over the project MED default
- **THEN** model settings show the effective owner selection and its source rather than claiming the owner uses MED

### Requirement: Changes apply at safe boundaries
Saving project overrides SHALL affect new dispatches, new direct model operations and the next idle owner turn. It MUST NOT change an active turn or retroactively change the defaults of an existing Room or Workflow, including its later steps, retries and recurring runs. The user SHALL be told which work retains earlier defaults. Each operation SHALL retain the configuration revision used to resolve it.

#### Scenario: Override saved during work
- **WHEN** the user saves new defaults while the owner and a Workflow are working
- **THEN** both active turns retain their selections and the existing Workflow retains its default snapshot
- **AND** new dispatches use the new defaults and the owner applies its change only between turns under approved authority

#### Scenario: Global defaults change
- **WHEN** a global tier changes after a Workflow was created
- **THEN** the Workflow keeps its snapshot and a subsequent new project dispatch resolves inherited tiers from the updated global settings

### Requirement: Model settings cannot widen authority
Model and thinking selections SHALL be checked against the available catalogue and existing host permissions. An unavailable model or unsupported thinking level SHALL produce an actionable refusal, not a silent provider switch. An owner change that needs a new grant SHALL wait for user approval at a safe boundary. Earlier session references, charges and project state MUST survive a refused or approved change, and only one owner driver SHALL be active.

#### Scenario: Grant declined
- **WHEN** a new owner model needs a grant and the user declines it
- **THEN** no owner turn starts under the unapproved model
- **AND** the project retains its earlier work and usage and explains the pending model change

#### Scenario: Invalid selection
- **WHEN** an overridden model becomes unavailable before a new operation starts
- **THEN** affected work is held with the model problem identified and no different provider is selected silently
