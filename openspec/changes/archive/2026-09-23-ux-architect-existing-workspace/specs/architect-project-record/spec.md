## ADDED Requirements

### Requirement: A project can start on an existing workspace

Creating a project on an existing workspace SHALL record that workspace's id and path on the project record, and SHALL NOT create a workspace or register one. A workspace SHALL hold at most one Architect project.

#### Scenario: The workspace is linked, not created

- **WHEN** the user creates a project on an existing workspace
- **THEN** the record holds that workspace's id and path, and the set of registered workspaces is unchanged

#### Scenario: The workspace's own contents are unchanged

- **WHEN** a project is created on an existing workspace
- **THEN** the workspace's files and its workspace configuration are unchanged

#### Scenario: A workspace already holds a project

- **WHEN** a workspace already holds an Architect project and a second project is created on it
- **THEN** the creation is refused and no second record is written
