# Built-in MCP Plugin for Sero

**Date:** 2026-04-20
**Status:** Draft
**Directory:** /Users/danielcarter/Documents/Dev/projects/sero/sero

## Intent
Build a new first-party **MCP** plugin inside the Sero monorepo by converting the existing `pi-mcp-adapter` product into a **Sero-native, UI-first management experience**. The result should let a single Sero user configure MCP servers, complete authentication, inspect current status, use MCP capability through Sero, and open MCP-provided UIs/resources without feeling like they are using a bolted-on adapter.

The key outcome is not just feature parity with the existing adapter. The key outcome is a **polished personal MCP control center** that feels as sophisticated and integrated as Sero's stronger built-in plugins, especially `sero-admin-plugin` and `sero-git-plugin`.

## User Story
As a Sero user who wants to connect MCP servers to my local Sero environment, I want a built-in MCP control center where I can add and manage servers, authenticate them, check their status, and open MCP-provided UIs/resources, so that MCP feels like a natural part of Sero instead of an external tool or command-only workflow.

## Behavior
The plugin appears as a built-in first-party Sero app named around **MCP**. Its main experience is a **hybrid** of:
- an approachable overview/dashboard layer for current setup and status
- deeper admin-style drill-down views for individual servers

The product is optimized for a **single-user local Sero install**. It assumes the user broadly understands what MCP servers are, but it should still help new users get started through a **lightweight setup wizard** and clear examples/help text. The UX should be user-friendly and not needlessly technical, while still making deeper diagnostic information available whenever something goes wrong.

The plugin is the primary place to:
- add, edit, enable, disable, reconnect, and remove MCP servers
- complete authentication flows
- inspect auth and connection status
- view and open that server's MCP-provided UIs/resources
- recover from server, auth, or resource failures without leaving the plugin

The plugin is also the primary visual surface for MCP management, but Sero CLI should still be able to perform **basic management** actions and use the MCP capability exposed through Sero.

### Happy Path
1. The user opens the built-in MCP plugin in Sero.
2. On first use, the plugin offers a lightweight setup wizard.
3. The user creates a new MCP server entry using a forms-first setup flow.
4. The plugin provides examples/help text while the user fills in server details.
5. The user saves the server and connects it.
6. If authentication is required, the user completes it entirely from the plugin UI.
7. The server detail view shows current auth state, connection state, and available MCP-provided UIs/resources.
8. The user opens an MCP-provided UI/resource directly inside the plugin.
9. Sero can use the plugin's single MCP proxy tool for agent workflows.
10. If needed, the user can also use Sero CLI for basic MCP management actions such as listing status or reconnecting a server.

### Edge Cases & Error Handling
- **Authentication failure:** The user stays inside the plugin, sees a friendly explanation, gets clear next steps, and can retry or re-authenticate from the same surface.
- **Offline or unreachable server:** The plugin shows current status clearly, explains the problem in plain language first, and offers actionable recovery steps such as reconnecting.
- **Embedded MCP resource cannot render cleanly:** The plugin keeps the user in context and shows recovery guidance inside the plugin rather than requiring an external browser/window for the core flow.
- **User needs technical detail:** Technical diagnostics are available on demand, are easy to copy/paste, and support an explicit **Ask Sero to help** recovery path.
- **Healthy system state:** The UI does not overwhelm the user with technical details when everything is working.

## Scope
### In Scope
- A new built-in first-party MCP plugin in the Sero monorepo
- A polished Sero-native UI comparable in sophistication to `sero-admin-plugin` or `sero-git-plugin`
- A hybrid experience with overview/dashboard entry points and deeper per-server drill-down views
- First-run lightweight setup wizard
- Forms-first creation and editing of MCP server entries
- Advanced raw-config inspection/editing for users who want it
- Full server management from the plugin UI:
  - add
  - edit
  - enable/disable
  - connect/reconnect
  - remove
- Support for both `stdio` and `HTTP/SSE` MCP server transports
- Global MCP configuration for the user's Sero install
- Authentication handled entirely in the plugin UI
- Server detail views that show auth state and connection state
- Embedded viewing/opening of MCP-provided UIs/resources inside the plugin
- A single agent-facing MCP proxy tool exposed through Sero
- Basic Sero CLI control for MCP management, including status visibility and basic server control actions
- Friendly default error UX with technical details available on demand
- Explicit **Ask Sero to help** actions in failure states
- README-level documentation covering setup, auth, CLI control, and troubleshooting

### Out of Scope
- Importing existing config, token, or state from `~/.pi/agent` or prior Pi MCP setups
- Direct per-server or per-tool exposure in v1
- Making command-driven workflows the primary way to manage MCP
- Rich session-history browsing as a first-class product surface in v1
- Requiring external browser windows or popups for core MCP UI/resource flows
- Multi-user, team-admin, or enterprise management workflows
- Workspace-specific MCP configuration in v1
- A curated marketplace/catalog of known MCP servers in v1

## Priorities
### Priority 1 — Core Product Shape
- The plugin must feel like a native first-party Sero app, not a thin wrapper around the existing adapter.
- The plugin must make MCP server setup, management, authentication, and current status understandable and comfortable for a single user.
- MCP-provided UIs/resources must be usable from inside the plugin.

### Priority 2 — Reliable Daily Usability
- The primary UI must support all important server-management actions without forcing the user to drop into commands.
- Error states must be easy to understand and recover from.
- Sero CLI must cover basic management needs for users who prefer command access.

### Priority 3 — Advanced User Confidence
- Advanced users must be able to inspect raw config when needed.
- Technical details must be easy to reveal and copy/paste.
- The product should make it easy to ask Sero for help when something fails.

## Effort & Quality
- **Level:** production
- **Tests:** thorough
- **Docs:** README

## Constraints
- The plugin is a **built-in** Sero plugin in the monorepo, not an external add-on.
- The product should preserve the existing adapter's core value while becoming **Sero-native** in UX and workflow.
- The UI should be friendly by default and avoid unnecessary technical complexity.
- Users are expected to have a basic understanding of MCP server concepts, but onboarding should reduce friction through a lightweight wizard and examples/help.
- Technical diagnostics must exist, but they should not dominate the healthy-state experience.
- MCP configuration is **global** to the Sero install.
- MCP UI/resource discovery in v1 happens from **server detail views**, not a separate central resource browser.
- Basic management must remain accessible from **Sero CLI** in addition to the plugin UI.
- The agent-facing tool surface must stay intentionally simple in v1.
- The source behavior being adapted comes from `/Users/danielcarter/Documents/Dev/ai/pi-mcp-adapter`.

## Non-Goals
- Recreating Pi-specific command/TUI workflows as the main product experience
- Exposing the full direct-tool surface of the original adapter in v1
- Solving migration from prior Pi MCP installs in the first release
- Building a deep observability console or session-history explorer before the core management experience is solid
- Expanding this feature into a broader multi-user or policy-management system

## Decisions Deferred to Planner
These are implementation decisions, not open product-scope questions:
- Exact package name, app id, icon, and manifest naming
- Exact CLI command names and syntax for basic MCP management actions
- Exact visual layout of the hybrid dashboard/drill-down experience
- Exact storage-file layout inside Sero, as long as it stays global to the Sero install and honors the product scope above
- Exact embedded viewer mechanics for MCP-provided UIs/resources, as long as core flows remain in-plugin
- Exact internal split of adapted code from `pi-mcp-adapter`

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: A built-in **MCP** plugin appears as a first-party Sero app.
- [ ] ISC-2: The main experience blends overview panels with deeper server drill-downs.
- [ ] ISC-3: First run offers a lightweight wizard for initial MCP setup.
- [ ] ISC-4: New server setup starts blank and includes examples/help text.
- [ ] ISC-5: Users can add MCP servers from the plugin UI.
- [ ] ISC-6: Users can edit server settings from forms-first screens.
- [ ] ISC-7: Advanced users can inspect and edit raw config.
- [ ] ISC-8: Users can enable or disable a configured server.
- [ ] ISC-9: Users can connect or reconnect a configured server.
- [ ] ISC-10: Users can remove a configured server from the plugin UI.
- [ ] ISC-11: The plugin supports `stdio`-based MCP servers.
- [ ] ISC-12: The plugin supports `HTTP/SSE`-based MCP servers.
- [ ] ISC-13: MCP configuration is global to the user's Sero install.
- [ ] ISC-14: Agent-facing integration exposes exactly one MCP proxy tool.
- [ ] ISC-15: Sero CLI can list configured MCP servers and current status.
- [ ] ISC-16: Sero CLI can trigger basic server control actions.
- [ ] ISC-17: Authentication flows are completed from the plugin UI.
- [ ] ISC-18: Each server detail view shows auth state and connection state.
- [ ] ISC-19: Each server detail view exposes that server's MCP UIs/resources.
- [ ] ISC-20: Users can open MCP-provided UIs/resources inside the plugin.

### Edge Cases
- [ ] ISC-21: Healthy-state screens default to friendly, non-technical language.
- [ ] ISC-22: Failure states expose copyable technical details on demand.
- [ ] ISC-23: Failure states include an explicit **Ask Sero to help** action.
- [ ] ISC-24: Auth failures keep users in-plugin and show recovery guidance.
- [ ] ISC-25: Offline servers show actionable recovery steps in the plugin.
- [ ] ISC-26: Unrenderable MCP resources stay in-plugin and show recovery guidance.
- [ ] ISC-27: Current server status is visible without detailed session-history views.
- [ ] ISC-28: A README covers setup, auth, CLI control, and troubleshooting.

### Anti-Criteria
- [ ] ISC-A-1: No direct per-server or per-tool exposure ships in v1.
- [ ] ISC-A-2: No Pi config, token, or state import ships in v1.
- [ ] ISC-A-3: No external browser or popup is required for core MCP UI flows.
- [ ] ISC-A-4: No command-first workflow is required for core management tasks.
- [ ] ISC-A-5: No rich session-history explorer is required in v1.
