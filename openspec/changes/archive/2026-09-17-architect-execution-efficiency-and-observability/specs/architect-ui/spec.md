## MODIFIED Requirements

### Requirement: Controls

The project page SHALL offer pause, resume, stop, raise cap, change autonomy, open session and delete. It SHALL also offer project model settings and run metrics through its project controls menu. The page body SHALL show only a compact model-defaults summary and one run-metrics entry point beside those menu entries; it MUST NOT gain an event log or a metrics dashboard. Run metrics SHALL open a dedicated full-width visual inspector with enough space for the execution timeline and selected-activity detail. Pause and stop MUST NOT cancel in-flight Workflows or Rooms; they stop the owner from being woken.

#### Scenario: Pause

- **WHEN** the user pauses a project with a running Workflow
- **THEN** the Workflow continues, the project shows `paused`, and the owner is not woken until resume

#### Scenario: Open run metrics

- **WHEN** the user selects run metrics in the project menu
- **THEN** the visual inspector opens within Architect with run and project-lifetime views
- **AND** returning to the project page does not add trace rows or metric charts to that page

#### Scenario: Inspect project model defaults

- **WHEN** the user opens model settings from the project menu
- **THEN** the view distinguishes inherited and overridden tiers, effective selections and pending changes for future work

## ADDED Requirements

### Requirement: Inspector interactions are accessible and preserve context

The inspector SHALL support keyboard access to its run selector, timeline expansion, filters, charts and selected-activity detail. Status and missing-data meaning MUST NOT depend on color alone. Returning to the project SHALL preserve the user's project context, and saved layout preferences SHALL use the host layout service rather than browser storage.

#### Scenario: Inspect without a pointer

- **WHEN** a user navigates the inspector by keyboard
- **THEN** they can select an activity, inspect its values and return to the project without requiring hover-only controls
