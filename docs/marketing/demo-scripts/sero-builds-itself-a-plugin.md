# Sero builds itself a plugin 60-second demo

## Hook

I asked my AI workspace to add a feature to itself.

## Shot list

| Time | Shot | Must be visible | Spoken/caption line |
|---|---|---|---|
| 0:00–0:07 | Start in the agent conversation. Type: “Build a release-checklist plugin with a UI that produces a release readiness report.” | Chat panel / agent conversation | “I ask Sero to build a plugin for this workspace.” |
| 0:07–0:15 | The agent explains the plugin plan, then file creation begins. Cut between the chat and generated files. | Chat panel / agent conversation; Explorer workspace roots / generated plugin files under `plugins/sero-release-checklist-plugin/` | “It plans the app, tools, state, and UI, then writes the plugin files.” |
| 0:15–0:23 | Show the generated plugin folder and key files: `package.json`, shared types, extension entry, UI, Vite config. | Explorer workspace roots / generated plugin files | “This is source code, not a hidden automation.” |
| 0:23–0:31 | Sero asks before attaching the plugin folder to the active workspace. Click “Attach folder”. | PendingQuestionCard standard question UI with prompt that the folder will be visible in Explorer and editable by the agent; “Attach folder” and “Cancel” options | “Before it changes the workspace roots, Sero stops for approval.” |
| 0:31–0:39 | Build/typecheck runs. If the command is gated, pause on the warning card and click “Allow”, then show terminal output. | PendingQuestionCard permission gate UI labelled “dangerous command, approval required” with the command and “Allow” / “Block”; Terminal/tool-call output for build and typecheck commands | “Commands that need permission stay on screen until I allow them.” |
| 0:39–0:47 | Open plugin discovery. Show the plugin card and install/open path. | App Store dialog with Installed and Discover tabs; Discover plugin card with Install button and installed state | “After it builds, the plugin appears through Sero’s app discovery flow.” |
| 0:47–0:53 | Open the new app from the sidebar or installed app entry. | Sidebar/favourited discovered app entry; Active app area where federated plugin UI is mounted | “Now the feature is mounted inside Sero like any other app.” |
| 0:53–1:00 | Use the release-checklist UI to show or generate the release readiness report. Keep the shot on the result. | Active app area where the federated plugin UI is mounted; release readiness report only if the demo plugin actually implements it | “The result is a real plugin UI, built from the request I typed.” |

## Honest caveats

- Sped up: file creation is shown quickly; install, build, and typecheck can take minutes.
- If a gated command appears, keep the full “dangerous command, approval required” approval beat in frame before clicking “Allow”.
- Workspace mount approval is required when attaching the plugin source folder; the prompt says this makes the folder visible in Explorer and editable by the agent, and does not activate the plugin.
- Plugin discovery is documented as immediate after installation, but local development setup or container recreation can take longer.
- The release-checklist plugin is created during the demo; it is not an existing built-in Sero feature.
- Sero plugin APIs are beta and contracts may evolve.
- Third-party or source plugins are trusted source code. Only install plugins from sources you trust.
- Local Plugin Development is documented under Admin → Plugins → Local Plugin Development; the inspected native folder picker title is “Start Local Plugin Development”.
