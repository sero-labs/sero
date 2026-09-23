## ADDED Requirements

### Requirement: Tier models are chosen through the shared picker

The Project models table and the New project Model overrides SHALL choose each
tier's model through the shared model field. Each tier's field SHALL list the
choice that restores inheritance first, and then every available model. The
thinking picker SHALL stay beside the model field. A native select MUST NOT
choose a tier's model.

#### Scenario: Choosing a tier's model

- **WHEN** the user opens a tier's model field in Project models
- **THEN** the choice that restores inheritance is listed first and every available model follows
- **AND** typing filters the listed choices by provider, model name and model id
- **AND** the thinking picker stays beside the field

#### Scenario: The field names what is chosen

- **WHEN** a tier has an effective model
- **THEN** the closed field names that model and its provider
- **AND** the thinking picker shows the effective thinking level

#### Scenario: Restoring inheritance

- **WHEN** the user picks the first choice for a tier that had an override
- **THEN** the tier inherits the global selection and its Source reads `global`

#### Scenario: New project overrides match

- **WHEN** the user opens a tier in the New project Model overrides
- **THEN** the same field is used, with the choice that restores inheritance first

### Requirement: The Effective column names the model and its thinking level

The Project models table's Effective column SHALL name each tier's effective
model by its model id, with its thinking level beside it, as
`<model id> · <thinking level>`. It MUST NOT print the provider-qualified
reference in place of the model id. Where the effective selection records no
thinking level, the cell SHALL name the model id alone. The tier's provider SHALL
stay reachable on its model field.

#### Scenario: A tier with a thinking level

- **WHEN** a tier's effective selection records a model id and a thinking level
- **THEN** its Effective cell names the model id and the thinking level, separated by `·`
- **AND** the provider is not repeated in that cell

#### Scenario: A tier with no thinking level

- **WHEN** a tier's effective selection records no thinking level
- **THEN** its Effective cell names the model id alone
