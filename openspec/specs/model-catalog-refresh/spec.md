## Purpose

Keeps built-in provider model definitions current without a Sero release or a Pi upgrade, so a model that ships upstream becomes selectable without waiting for the next app version.

## Requirements

### Requirement: Catalog scope

A refresh SHALL update model definitions for providers already present in the build. A refresh SHALL NOT introduce a provider, change a provider's display name or logo, or change a provider's authentication requirements.

#### Scenario: New model for a known provider

- **WHEN** the catalog offers a model that the installed build does not contain for a known provider
- **THEN** the model becomes selectable for that provider

#### Scenario: Unknown provider in the catalog

- **WHEN** the catalog offers a provider that the installed build does not contain
- **THEN** no provider is added and the model list is unchanged

### Requirement: Refresh after startup

The host SHALL refresh model definitions once after startup. The refresh MUST NOT block window creation, the first model list, or any turn.

#### Scenario: Window is usable during refresh

- **WHEN** the app window opens
- **THEN** the model list is available before the refresh completes

#### Scenario: Refresh completes in the background

- **WHEN** the startup refresh returns a changed catalog
- **THEN** the model list reflects the change without a restart

### Requirement: Periodic refresh

While the app runs, the host SHALL repeat the refresh at least every six hours, and MUST stop the schedule when the app quits.

#### Scenario: Long-running window

- **WHEN** a model is added upstream while the app stays open
- **THEN** the model becomes selectable within six hours without a restart

#### Scenario: Quit stops the schedule

- **WHEN** the app quits and the process is gone
- **THEN** no further catalog request is made

### Requirement: Offline intent is authoritative

When `PI_OFFLINE` indicates an offline intent, the host MUST NOT make a network request for the catalog, and SHALL still apply the previously stored catalog.

#### Scenario: Offline startup

- **WHEN** the app starts in offline mode with a stored catalog
- **THEN** the stored catalog applies and no catalog request is made

#### Scenario: Offline with no stored catalog

- **WHEN** the app starts in offline mode with no stored catalog
- **THEN** the built-in definitions apply and no catalog request is made

#### Scenario: Offline suppresses a scheduled tick

- **WHEN** a scheduled refresh falls due while `PI_OFFLINE` is set
- **THEN** the tick is skipped without a network request

### Requirement: Refresh never fails the app

A missing, unreachable, or malformed catalog MUST NOT remove models, change the active model, or fail a turn. The previous definitions SHALL remain in use and the failure SHALL be recorded as a warning.

#### Scenario: Catalog host unreachable

- **WHEN** the catalog request fails
- **THEN** the previous model list stays available and a warning is recorded

#### Scenario: Malformed catalog body

- **WHEN** the catalog response is not a valid model list
- **THEN** the previous model list stays available and a warning is recorded

### Requirement: Refreshed definitions reach live sessions

When a refresh returns a changed definition for a model that a live session uses, the session SHALL use the refreshed definition. The session's thinking level SHALL be clamped to the refreshed model's supported levels.

#### Scenario: Thinking level no longer supported

- **WHEN** a refresh drops a thinking level that a live session had selected
- **THEN** the session's thinking level is clamped to a supported level and the session keeps working

#### Scenario: Thinking level still supported

- **WHEN** a refresh changes a model's metadata but its supported thinking levels still include the session's level
- **THEN** the session's thinking level is unchanged

### Requirement: Selections survive a refresh

A refresh MUST preserve provider-qualified model identity, so saved default models, tier selections, and fallback chains keep resolving. A model that the refreshed catalog omits SHALL stay listed.

#### Scenario: Saved selection still resolves

- **WHEN** a refresh returns a changed definition for the saved default model
- **THEN** the saved selection still resolves to that provider and model

#### Scenario: Model absent from the refreshed catalog

- **WHEN** the refreshed catalog omits a model that the installed build contains
- **THEN** the model stays listed and selectable

### Requirement: Refreshes do not overlap

The host SHALL serialise catalog refreshes so that two refreshes never run at the same time.

#### Scenario: Credential change during a scheduled refresh

- **WHEN** credentials change while a scheduled refresh is in flight
- **THEN** the second refresh waits for the first and makes one request per provider
