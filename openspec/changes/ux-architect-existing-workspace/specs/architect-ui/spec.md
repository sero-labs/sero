## MODIFIED Requirements

### Requirement: Intake

Creating a project SHALL ask for the idea text and, then, where the work happens: a new folder, or a workspace that already exists. New folder SHALL ask for the project's name and location, and the Architect SHALL create that folder, initialise the repository and register the workspace before discovery starts. Existing workspace SHALL replace the name and location with a picker of registered workspaces, and the project SHALL take the chosen workspace's name. The picker SHALL list workspaces that hold no Architect project first, each with its path. A workspace that already holds an Architect project SHALL be shown as "Architect project" and MUST NOT be choosable. The Global workspace MUST NOT be offered. New folder MUST refuse a folder that already exists, and MUST NOT change that folder, its workspace configuration, or its registration.

#### Scenario: Create from an idea

- **WHEN** the user enters an idea, chooses New folder, and confirms with a name and a location
- **THEN** a project appears in `intake`, the folder and the workspace exist, and the persistent-session grant prompt follows

#### Scenario: Start on an existing workspace

- **WHEN** the user enters an idea, chooses Existing workspace, chooses a workspace and confirms
- **THEN** a project appears in `intake` carrying the chosen workspace's name, and no workspace is created or registered

#### Scenario: The picker orders free workspaces first

- **WHEN** the picker opens and some registered workspaces already hold an Architect project
- **THEN** the workspaces without a project are listed first, each with its path, and the others are shown as "Architect project" and cannot be chosen

#### Scenario: The Global workspace is not offered

- **WHEN** the picker opens
- **THEN** the Global workspace is absent from the list

#### Scenario: New folder refuses an existing folder

- **WHEN** the user chooses New folder and confirms with a name and a location where that folder already exists
- **THEN** no project is created, the existing folder, its workspace configuration and its registration are unchanged, no sibling folder is created, and the dialog says the folder exists
