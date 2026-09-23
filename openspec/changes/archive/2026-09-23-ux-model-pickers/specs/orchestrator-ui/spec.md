## ADDED Requirements

### Requirement: A step's model is one filterable field

A Workflow step's model control SHALL be one combobox field. The field SHALL
list `Auto`, `LOW`, `MED` and `HIGH` first, and then every available model.
Typing SHALL filter the fixed choices and the models together. The control MUST
NOT require a separate choice to reach the model list, and MUST NOT be a native
select. Where the step has a pinned model, the field SHALL show that model and
SHALL offer one control to clear the pin. The agent and the tools SHALL remain
separate controls beside the model field.

#### Scenario: A step with no model change

- **WHEN** the user opens the Tune panel on a step with no model override
- **THEN** the model field reads `Auto`, and its list starts with Auto, LOW, MED and HIGH, then every model

#### Scenario: Pinning a specific model

- **WHEN** the user types part of a model's name in the step's model field and picks it
- **THEN** the step's model is that model
- **AND** the field names the model and its provider

#### Scenario: Clearing a pinned model

- **WHEN** the user clears the step's pinned model
- **THEN** the step reads `Auto` again

#### Scenario: Agent and tools are unchanged

- **WHEN** the step's model field is shown
- **THEN** the agent and tools controls stay beside it and keep their own behaviour
