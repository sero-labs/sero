## Purpose

Plugins can create a workspace through the typed plugin bridge, so a plugin can start a project in a new folder without a plugin-specific host bridge.

## ADDED Requirements

### Requirement: Create a workspace from plugin code
The host SHALL expose workspace creation to plugin runtimes and plugin UI through the typed plugin bridge, taking a name, a parent folder and the existing creation options, and returning the workspace record. The call MUST be backed by the same workspace service and MUST apply the same home-directory guard as the existing user-facing creation path.

#### Scenario: Create under the home directory
- **WHEN** a plugin creates a workspace with a parent folder under the user's home directory
- **THEN** the workspace is registered, the record is returned, and the workspace list push reaches every listener

#### Scenario: Parent outside the home directory
- **WHEN** a plugin passes a parent folder outside the user's home directory
- **THEN** the call fails with the same error as the user-facing path and no folder is created

### Requirement: Contracts stay aligned
The renderer types, the preload bridge, the main-process handler and the runtime host type MUST expose the same signature, and the capability MUST be declared in the plugin's required host capabilities when the plugin cannot work without it.

#### Scenario: Plugin without the declaration
- **WHEN** a plugin that did not declare the capability calls workspace creation
- **THEN** the call is refused with a message naming the missing capability

### Requirement: Existing creation hooks still run
Creation through the bridge MUST run the same post-creation contributions as the user-facing path, including any `workspace.create.option` controls the user enabled.

#### Scenario: Graphify option
- **WHEN** the user has Graphify indexing on by default and a plugin creates a workspace
- **THEN** Graphify indexing is enabled for the new workspace
