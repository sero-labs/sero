## Purpose

Defines what one model picker promises everywhere it is used, so choosing a
model reads the same in Architect, the Orchestrator and every settings surface,
and no surface hides the model list behind a second control.

## ADDED Requirements

### Requirement: One type-to-filter field chooses a model

Every model picker in Architect and the Orchestrator, and every settings surface
that already uses the shared model field, SHALL choose a model with one combobox
field, so the control reads the same on each screen. The field SHALL accept
typing and SHALL filter by provider name, model name and model id together.
While its list is open, the arrow keys SHALL move the highlighted row, Enter SHALL
choose it, and Escape SHALL close the list without changing the choice. The field
MUST NOT require a separate control to reveal a searchable list.

#### Scenario: Filter by provider

- **WHEN** the user types a provider's name into the field
- **THEN** only that provider's models remain listed

#### Scenario: Filter by model name

- **WHEN** the user types part of a model's name
- **THEN** that model remains listed

#### Scenario: Filter by model id

- **WHEN** the user types part of a model's id
- **THEN** that model remains listed

#### Scenario: Keyboard only

- **WHEN** the list is open and the user presses the arrow keys and then Enter
- **THEN** the highlighted model becomes the chosen model and the list closes

#### Scenario: Escape leaves the choice alone

- **WHEN** the list is open and the user presses Escape
- **THEN** the list closes and the saved model is unchanged

### Requirement: Every row and the closed field name the provider

Each row of the picker SHALL name the model and its provider. After a choice,
the closed field SHALL name the chosen model and its provider. Two models with
the same name from different providers MUST be distinguishable without relying
on row order, a group heading or a logo.

#### Scenario: Two models share a name

- **WHEN** two models with the same name from different providers are listed
- **THEN** each row names its provider, so the two can be told apart

#### Scenario: The chosen model is shown closed

- **WHEN** a model has been chosen
- **THEN** the closed field names that model and its provider

### Requirement: Fixed choices come before the models

Where a caller offers fixed choices such as `Auto`, a tier name or the inherited
global selection, those choices SHALL be listed before the models. The field's
query SHALL filter the fixed choices and the models by the same rule.

#### Scenario: Tiers filter with the models

- **WHEN** a picker offers `Auto`, `LOW`, `MED` and `HIGH` before the models and the user types a query
- **THEN** the fixed choices and the models are filtered by that same query

#### Scenario: No query shows every model

- **WHEN** the field is open with an empty query
- **THEN** the fixed choices are listed first and every available model follows

### Requirement: A saved choice that is not in the catalogue is still shown

Where the saved value names a model the picker cannot resolve, the picker SHALL
show the saved value. It MUST NOT show an empty field and MUST NOT silently
choose another model.

#### Scenario: A model leaves the catalogue

- **WHEN** a saved model is not in the available list
- **THEN** the closed field shows the saved value
- **AND** the list offers the models that are available

### Requirement: A pinned choice can be cleared in one action

Where a caller allows clearing, the picker SHALL offer one control that clears
the saved model without opening the list.

#### Scenario: Clear a pinned value

- **WHEN** the user clears a pinned model
- **THEN** the saved value is removed and the field shows the caller's placeholder
