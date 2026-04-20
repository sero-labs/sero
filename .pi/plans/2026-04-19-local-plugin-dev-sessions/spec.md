# Local Plugin Dev Sessions

**Date:** 2026-04-19
**Status:** Draft
**Directory:** /Users/danielcarter/Documents/Dev/projects/sero/sero

## Intent
Sero should let plugin authors use production Sero as a real local authoring environment for plugins. Local plugin development must be a first-class product concept with its own lifecycle, clearly separated from Installed Plugins and Attached folders, while supporting profile-scoped activation, managed UI development, automatic refresh, and clear recovery when something goes wrong.

## User Story
As a Sero plugin author, I want to start developing a local plugin directly from production Sero, so that I can iterate on a real plugin checkout without reinstalling it, without confusing it with an installed plugin, and without having to attach the folder to a workspace just to make it run.

## Product Terms
- **Installed Plugins**: plugins added through the normal package installation lifecycle.
- **Attached folders**: generic workspace folders added for explorer/editor visibility.
- **Local Plugin Development**: the dedicated authoring flow for running a local plugin checkout as a profile-scoped dev session.
- **Plugin dev session**: one local-development session tied to one plugin/app identity within one profile.

## Behavior
The product must present local plugin development as its own Admin experience, separate from installation and separate from Attached folders. A plugin author starts from **Admin → Local Plugin Development**, chooses a local plugin folder, and Sero validates whether that folder can run as a plugin dev session for the current profile.

If the folder is valid, Sero creates a profile-scoped dev session and activates the plugin for that profile only. If the plugin has a UI dev server workflow, Sero launches and manages that dev server as part of starting development. If live UI development is unavailable, Sero should keep the plugin usable when possible by falling back to built UI assets or by keeping backend-only functionality active.

While a dev session is active, Sero should make the current UI source very explicit so the author always knows whether the plugin is using a live dev server, built fallback assets, or no UI. Local changes should trigger automatic refresh attempts in v1. Transient refresh failures should not immediately tear down a working session, but confirmed hard invalidity should deactivate the session and preserve it as a recoverable broken record in the Local Plugin Development UI.

### Happy Path
1. The author opens **Admin → Local Plugin Development**.
2. The author chooses a local plugin folder to develop.
3. Sero validates the folder and checks for app identity conflicts.
4. Sero creates a dev session for the current profile.
5. If the plugin supports a UI dev server, Sero launches and manages it.
6. The plugin becomes active in Sero without being treated as an installed plugin.
7. The Admin UI shows the session as active and clearly indicates its current UI mode.
8. As the author changes local plugin files, Sero attempts to refresh the session automatically.
9. If refresh succeeds, the updated plugin behavior becomes available without reinstalling.

### Edge Cases & Error Handling
- **Conflicting app ID at startup or start-dev time**: Sero must hard-block activation and explain whether the conflict is with a built-in app, an installed plugin, or another active dev session.
- **Conflict during install**: install flows must clearly explain when installation is blocked because an active dev session already owns that app ID.
- **Missing folder on startup**: the saved session remains visible in Local Plugin Development but does not activate.
- **Invalid plugin metadata on startup**: the saved session remains visible as broken but inactive.
- **Dev server fails to start or stops responding**: Sero should keep the session active when possible by falling back to built UI assets if available.
- **UI unavailable but backend still useful**: the session may stay active for backend behavior, while clearly indicating that the UI is unavailable.
- **Backend-only plugin**: the session remains valid even though no UI surface exists.
- **Transient refresh failure**: the last known working session stays active and the UI shows that attention is needed.
- **Confirmed hard invalidity while running**: once Sero confirms a hard failure such as a deleted source folder, unrecoverable manifest invalidity, or a newly introduced app-ID conflict, the active session is deactivated and preserved as broken for recovery or removal.
- **Profile switch**: only the new profile’s dev sessions should exist in that profile experience after relaunch.

## Admin Experience
The Admin surface should clearly separate three concepts:

1. **Installed Plugins**
2. **Local Plugin Development**
3. **Attached folders**

The same release should rename older plugin-specific workspace wording to **Attached folders** so the product no longer implies that folder attachment is how plugin activation works.

The Local Plugin Development area should make these behaviors clear:
- starting local development is different from installing a plugin
- local development is scoped to the current profile
- attaching a folder is not required for activation
- the current UI mode is visible at a glance
- broken or degraded sessions are recoverable rather than silently disappearing

Profile scope should be documented in the UI/help copy, but it does not need heavy persistent profile labeling on every row.

## Scope
### In Scope for v1
- A dedicated **Local Plugin Development** Admin section.
- Starting local development from a chosen local plugin folder.
- Validation before creating a dev session.
- Profile-scoped dev-session activation.
- One active dev session per plugin/app identity per profile.
- Sero-managed launch and lifecycle of a plugin’s local UI dev server.
- Very explicit UI-mode visibility for active sessions.
- Support for backend-only plugins.
- Automatic refresh attempts for local plugin changes.
- Graceful handling of transient refresh failures without immediate deactivation.
- Hard-block conflict behavior for built-in apps, installed plugins, and other active dev sessions.
- Broken-session persistence across restarts, with inactive-but-visible recovery state.
- Explicit install-flow messaging when an active dev session blocks installation.
- Renaming plugin-specific workspace language to **Attached folders**.
- Shipping as a normal production Admin feature for plugin authors.

### Out of Scope / Deferred
- Requiring an Attached folder as part of starting or running local plugin development.
- Showing dev sessions as installed plugins.
- Any install-to-dev or dev-to-install bridge.
- Multiple active dev sessions for the same plugin/app within one profile.
- Cross-profile visibility or management of dev sessions.
- Reliance on `SERO_DEV_PLUGINS` as the product model for local authoring.
- Universal zero-restart HMR across every plugin surface.
- Guaranteeing that every transient failure can refresh automatically without user intervention.
- The **Attach folder to workspace** convenience action from the dev-session UI.
- Blocking all app startup until broken sessions are resolved.
- Hiding the feature behind an experimental or developer-only rollout.

## Effort & Quality
- **Level:** production
- **Tests:** thorough
- **Docs:** README / feature doc

## Constraints
- The feature must work in **production Sero**, not only in monorepo development mode.
- Plugin dev sessions must remain a distinct product concept from Installed Plugins and Attached folders.
- Dev sessions must be **profile-scoped** and isolated across profiles.
- Conflict handling must **fail closed** rather than relying on discovery-time shadowing.
- A dev session may remain active through transient refresh problems, but confirmed hard invalidity must stop active loading.
- The product must preserve broken-session metadata so authors can recover or remove failed sessions.
- Automatic refresh is part of the expected v1 experience, but the spec does not require a particular implementation strategy.
- A manual retry or refresh control is allowed but not required.

## Rollout Expectations
This should ship as a normal Admin feature in production Sero, aimed primarily at plugin authors. It should feel productized enough to rely on for day-to-day local authoring, even if deeper automation and polish continue in later releases.

## Open Questions / Deferred Product Decisions
These do not block the product spec, but exact answers can be decided during planning/design:
- What exact label should Sero use for the softer non-broken degraded state: **Needs attention**, **Refresh failed**, **Degraded**, or similar?
- Should fallback from live dev server to built UI always show a toast/notification, or is a strong inline status indicator sufficient?
- What exact help text best explains profile scope without overloading the UI?

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: Admin includes a dedicated **Local Plugin Development** section.
- [ ] ISC-2: Users can start local plugin development by choosing a local plugin folder.
- [ ] ISC-3: Sero validates the chosen folder before creating a dev session.
- [ ] ISC-4: A valid dev session activates only for the current profile.
- [ ] ISC-5: Dev sessions are not shown in the Installed Plugins list.
- [ ] ISC-6: Plugin-workspace wording is renamed to **Attached folders**.
- [ ] ISC-7: Starting a UI plugin dev session launches its local UI dev server.
- [ ] ISC-8: Active dev sessions clearly show when UI is using the local dev server.
- [ ] ISC-9: Active dev sessions clearly show when UI is using built fallback assets.
- [ ] ISC-10: Active dev sessions clearly show when the plugin has no UI surface.
- [ ] ISC-11: Local plugin changes trigger automatic refresh attempts in v1.
- [ ] ISC-12: Backend-only plugins can run as local dev sessions.

### Edge Cases
- [ ] ISC-13: App ID conflicts block dev-session startup.
- [ ] ISC-14: Conflict errors identify what the dev session conflicts with.
- [ ] ISC-15: Invalid saved dev sessions remain visible after app restart.
- [ ] ISC-16: Invalid saved dev sessions do not activate on startup.
- [ ] ISC-17: Dev-server failure falls back to built UI when built UI is available.
- [ ] ISC-18: A plugin can remain active without UI when backend behavior still works.
- [ ] ISC-19: Transient refresh failures do not immediately deactivate a working session.
- [ ] ISC-20: Confirmed hard invalidity deactivates the active dev session.
- [ ] ISC-21: Install flows clearly report conflicts with active dev sessions.

### Anti-Criteria
- [ ] ISC-A-1: Starting local development does not create a managed plugin install.
- [ ] ISC-A-2: Starting local development does not require attaching a workspace folder.
- [ ] ISC-A-3: Local plugin authoring does not depend on `SERO_DEV_PLUGINS`.
- [ ] ISC-A-4: One profile cannot run multiple active dev sessions for one plugin/app.
- [ ] ISC-A-5: Profile switching does not surface dev sessions from another profile.
- [ ] ISC-A-6: v1 does not require an install-to-dev or dev-to-install bridge.
