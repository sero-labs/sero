## Purpose

The Architect plugin joins the built-in persistent-session gate so it can open an owner session under the same exact-path check and per-grant user approval that Rooms use.

## ADDED Requirements

### Requirement: Architect is allowlisted by exact path
The built-in persistent-session gate SHALL include the `architect` app mapped to the bundled `sero-architect-plugin` package. The gate MUST continue to require that the app's canonical path equals the bundled plugin path the host discovered, and MUST deny any other package that presents the `architect` id.

#### Scenario: Bundled plugin
- **WHEN** the bundled Architect plugin's runtime starts
- **THEN** the persistent-session capability is present from the runtime's first start

#### Scenario: Copy outside the bundle
- **WHEN** a plugin at another path declares the `architect` app id
- **THEN** the gate denies it with the package-path-mismatch reason and the capability is absent

### Requirement: Per-grant approval unchanged
Adding the allowlist entry MUST NOT change the per-grant approval: every owner-session grant proposal is clamped against the real model, workspace, tool and skill catalogues and approved by the user as clamped.

#### Scenario: Proposal names an unavailable model
- **WHEN** the Architect proposes an owner session with a model that is not configured
- **THEN** the proposal is clamped before the user sees it and the approved grant omits that model
