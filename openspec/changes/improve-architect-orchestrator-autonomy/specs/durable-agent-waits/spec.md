# Spec Delta

## Purpose

Let supported agent executions wait for observable work and resume safely without losing the wait or user control across restart.

## ADDED Requirements

### Requirement: Observable waits are registered durably

An authorized Architect execution or Goal SHALL be able to register a wait for a supported child-operation completion, managed process exit or linked CI result. A wait SHALL retain its execution identity, condition, source identity, deadline, cancellation and observed outcome. Free-text reasons alone MUST NOT promise automatic resumption; unsupported conditions SHALL explain that manual resume is required.

#### Scenario: Wait for a linked task
- **WHEN** an execution waits for its known child operation
- **THEN** it shows the condition and retains the registration before yielding

#### Scenario: Unsupported arbitrary condition
- **WHEN** an agent describes a condition with no supported observable source
- **THEN** the system explains that it cannot monitor that condition and does not claim it will resume automatically

### Requirement: Matched conditions produce one continuation

A registered condition SHALL produce at most one eligible continuation for its wait identity. Registration SHALL reconcile source state so completion immediately before subscription is not lost. Duplicate or late notifications and restart SHALL NOT schedule duplicate turns. Recovery SHALL reconcile durable consumption with execution ownership before retrying an uncertain wake.

#### Scenario: Completion races registration
- **WHEN** a child completes as its wait is being registered
- **THEN** reconciliation observes that completion and queues one continuation

#### Scenario: Restart after wake reservation
- **WHEN** Sero restarts after reserving a matched wake but before confirming the turn started
- **THEN** recovery reconciles that reservation without losing the event or starting two turns

### Requirement: Current authority and user controls govern waking

Before a matched wait starts work, the runtime SHALL recheck current authority, budget, pause/stop intent, execution ownership and limits. An event received while paused SHALL remain available for explicit resume. Stop, cancellation or revocation MUST NOT be undone by a late event. A completed source MUST NOT be restarted merely because its waiter resumes.

#### Scenario: Pause precedes CI completion
- **WHEN** the user pauses before a linked CI result arrives
- **THEN** the result is retained without starting a paid turn
- **AND** explicit resume reconciles that result once

#### Scenario: Stop races completion
- **WHEN** the user stops an execution while its wait condition is met
- **THEN** the saved stop prevents autonomous continuation despite the completion event

### Requirement: Failed and expired waits are bounded

A failed source, expired deadline or unrecoverable source identity SHALL end the wait with its actual outcome and an actionable hold or bounded recovery. Wait failure MUST NOT imply task completion. Active time and waiting time SHALL remain distinct, and waiting MUST NOT silently extend an explicit user-approved wall-clock limit.

#### Scenario: Process result cannot be recovered
- **WHEN** restart prevents confirmation of the registered process outcome
- **THEN** the execution preserves work and states the uncertainty rather than assuming success or rerunning its external effects

### Requirement: Internal watchdogs do not replace user limits

The system SHALL distinguish explicit user-approved limits from internal watchdogs and inferred defaults. Progressing work within user authority SHALL be eligible for bounded checkpoint continuation when an internal watchdog intervenes. A watchdog SHALL detect stalls and preserve recovery state; an agent MUST NOT raise a user limit or turn repeated no-progress outcomes into indefinite continuation.

#### Scenario: A bounded multi-hour execution progresses
- **WHEN** work remains within approved budgets and duration while an internal turn watchdog expires
- **THEN** safe checkpoint recovery can continue without requiring manual resume solely because that watchdog expired

#### Scenario: Explicit duration expires
- **WHEN** the user-approved wall-clock limit is reached
- **THEN** new work stops at that limit and requires the applicable user change before resuming
