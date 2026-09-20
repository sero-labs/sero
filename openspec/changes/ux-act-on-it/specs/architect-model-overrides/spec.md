## ADDED Requirements

### Requirement: A selection that cannot be read now is not reported as unselected

Where the models view cannot resolve a tier's inherited global selection because the Architect runtime is not running, it SHALL say the global cannot be read now. It MUST NOT show that tier as having nothing selected, and MUST NOT ask the user to choose a model in order to clear a condition the user did not cause. A tier with a saved project override SHALL show that override whether or not the runtime is running.

#### Scenario: Architect off, tiers inherited

- **WHEN** the Architect runtime is not running and all three tiers inherit from global settings
- **THEN** each tier says the global cannot be read now, and none says a model is not selected

#### Scenario: Architect off, tier overridden

- **WHEN** the Architect runtime is not running and MED has a project override
- **THEN** MED shows its saved override and its source

#### Scenario: The runtime starts

- **WHEN** the runtime starts
- **THEN** each inherited tier shows its resolved global selection without the user acting

### Requirement: The owner's model is a row of the table

The models view SHALL show the owner's effective model, its thinking level and its source as a row of the tier table, alongside LOW, MED and HIGH, rather than as a sentence outside the table. When the runtime is not running, the row SHALL show the last known selection and say so. The rules about when a saved change takes effect SHALL be behind one disclosure rather than repeated beside each tier.

#### Scenario: The owner is pinned by its environment

- **WHEN** an owner environment pin takes precedence over the project's MED tier
- **THEN** the table has an owner row naming the effective model, its thinking level, and that its source is the environment
- **AND** the row says what the pin outranks

#### Scenario: The owner row with the runtime off

- **WHEN** the Architect runtime is not running
- **THEN** the owner row shows the last known model and thinking level and says that is what it is
