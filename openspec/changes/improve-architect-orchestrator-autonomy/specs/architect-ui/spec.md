# Spec Delta

## MODIFIED Requirements

### Requirement: Milestone rail links to detail

The milestone rail SHALL be available in the separate work view rather than required on the overview. Each milestone SHALL show its title, status and a link to its linked owner execution, Workflow or Room in the correct workspace. Direct milestones SHALL open their actual work and evidence details without manufacturing an Orchestrator record. The rail MUST NOT reproduce step/member transcripts or duplicate an active recovery control.

#### Scenario: Open detail
- **WHEN** the user follows a running milestone from the work view
- **THEN** the linked execution detail opens with its workspace intact, using Orchestrator for a Workflow or Room

#### Scenario: The header already offers the recovery
- **WHEN** the overview already has the applicable recovery action
- **THEN** the milestone rail retains status and navigation but does not add a second copy of that action

#### Scenario: Open a direct milestone
- **WHEN** the user follows a milestone executed by the owner
- **THEN** its work detail links to the retained owner session and runtime evidence
- **AND** no Workflow or Room is required to show its progress or results
