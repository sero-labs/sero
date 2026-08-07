# Launch video continuation prompt

Continue the Sero launch-video work from the current working tree.

Read this complete handoff before changing files.

## Goal

Produce one honest, clean flagship video.

The video must show this complete workflow:

1. Describe the plugin.
2. Create and build the plugin.
3. Install it through visible Sero controls.
4. Open the installed plugin.
5. Generate a real release-readiness report.
6. Show the report inside Sero.

Do not publish, deploy, push, or commit anything.

Do not ask Dan to operate commands or recording controls.

Use bounded direct automation. Do not start another open-ended Orchestrator loop.

## Current state

Branch:

`feat/sero-marketing-strategy`

Approved existing commit:

`a6cbd304d feat(recording): add cursor and click highlights`

Do not change that commit.

Sero is stopped.

No recording or agent build is active.

The working tree has no staged files.

The working tree has 28 modified files and five untracked files.

Some changes are unrelated Orchestrator repairs. Do not discard them blindly.

Do not commit any current change without Dan’s explicit approval.

## Recorder failure and root cause

Sero became unresponsive during a long `15 FPS` recording.

Dan forced Sero to close after it became unresponsive.

The forced close caused the final process exit. It did not cause the original hang.

The Electron log showed V8 using approximately `3.1 GB`.

The old recorder stored every PNG frame as a base64 string in one array.

Relevant old code was in:

`apps/desktop/electron/features/apps/app-control/host-service.ts`

The final MP4 was not several gigabytes.

The uncompressed frame collection consumed the Electron heap before encoding.

Do not raise the heap limit.

Do not lower video quality to hide the problem.

## Streaming recorder fix

The recorder now streams every PNG frame directly into `ffmpeg`.

It uses `image2pipe` and writes a compressed MP4 while recording.

It does not retain the image sequence in memory.

It does not write a temporary PNG sequence to disk.

Changed files:

- `apps/desktop/electron/shared/media/video-encoder.ts`
- `apps/desktop/electron/features/apps/app-control/host-service.ts`
- `apps/desktop/electron/__tests__/features/apps/app-control-host-service.test.ts`

The targeted recorder test passed:

```bash
cd apps/desktop
pnpm exec vitest run electron/__tests__/features/apps/app-control-host-service.test.ts
```

Result:

- One test file passed.
- Seven tests passed.

Both desktop TypeScript checks passed:

```bash
cd apps/desktop
pnpm exec tsc --noEmit
pnpm exec tsc -p tsconfig.electron.json --noEmit
```

A real bounded smoke recording also passed.

Observed smoke result:

- Duration: `15.266667` seconds
- Frames: `222`
- Average frame rate: approximately `14.4 FPS`
- Codec: `h264`
- Pixel format: `yuv420p`
- Resolution: `3024x1898`
- File size: `251,344 bytes`
- Temporary PNG directory: none

Smoke file:

`~/Movies/sero-demos/streaming-recorder-smoke.mp4`

The full ten-minute build recording also completed without exhausting memory.

Its raw file was only `17.5 MB`.

## Visible folder installation

Sero now has a visible App Store action named:

`Install from folder`

Changed files include:

- `apps/desktop/src/components/layout/AppStoreDialog.tsx`
- `apps/desktop/src/components/layout/AppStoreDialog.test.tsx`
- `apps/desktop/electron/ipc/integrations/plugins.ts`
- `apps/desktop/electron/preload/integrations/plugins.ts`
- Related IPC type files

The action opens a native macOS folder picker.

It installs the selected plugin package.

Installation errors remain visible inside the App Store.

The App Store test passed:

```bash
cd apps/desktop
pnpm exec vitest run src/components/layout/AppStoreDialog.test.tsx
```

The installation path was manually verified end to end.

Observed result:

1. The App Store showed `Install from folder`.
2. The generated plugin folder was selected.
3. `Release Checklist` appeared in installed applications.
4. The application opened inside Sero.
5. `Generate report` worked.
6. The report appeared inside the application.
7. `release-readiness.md` was created.

Do not claim an approval gate.

No repeatable approval gate was verified.

The video does not need an approval claim.

## Current recording script

Main file:

`apps/desktop/e2e/flagship-demo.agent.spec.ts`

The script now uses a small demo repository.

It no longer clones the complete Sero repository.

The demo project is named:

`Launchpad`

The workspace path is:

`~/.sero-ui/workspaces/release-checklist-demo`

The plugin folder is:

`release-checklist-plugin`

The visible prompt uses normal user language.

It does not show dependency-policy instructions.

It asks for:

- A standalone Release Checklist plugin
- One `Generate report` action
- Latest release
- Changes since that release
- Current uncommitted changes
- Open pull requests
- Release-blocking issues
- `release-readiness.md`
- A package ready for folder installation
- A completed build
- No installation or commit by the agent

The video has no elapsed timer.

Only these captions are approved:

Opening:

`Build and use a release checklist plugin from one prompt.`

Ending:

`The release checklist is ready to use.`

Do not add more captions without Dan’s approval.

Do not use third-person product copy.

Do not write captions such as “Sero is building the plugin.”

## Latest full run

The latest full run built the plugin successfully.

The build took approximately `10.8 minutes`.

The script failed after the build.

Exact failure:

`Sero recording click pulse did not appear after clicking Install from folder.`

Relevant locations:

- `apps/desktop/e2e/flagship-demo.agent.spec.ts`
- `installGeneratedPlugin()`
- `apps/desktop/e2e/helpers/demo.ts`
- `clickForDemo()`
- The pulse assertion was at approximately `helpers/demo.ts:195`

The macOS folder picker blocks the post-click DOM pulse check.

The visible button worked.

The native folder picker opened.

The generated plugin later installed successfully.

Do not rerun the long build until this click handling is fixed offline.

## Required script fixes

### Remove the preinstalled demo plugin

The profile already had `release-checklist` installed before recording.

That caused an older Release Checklist panel to appear before the prompt.

This invalidates the visual story.

Before recording, uninstall this plugin:

`release-checklist`

Use:

`window.sero.plugins.uninstall('release-checklist')`

Then poll:

`window.sero.plugins.list()`

Continue only after `release-checklist` is absent.

This setup happens before recording.

### Start on Explorer

Open Explorer before recording starts.

The center panel must not show Release Checklist before the prompt.

Verify this condition through the visible UI.

### Remove old demo sessions

The script-owned workspace contains older build sessions.

Before creating the new session:

1. Call `window.sero.sessions.list(workspace.id)`.
2. Delete every old session with `window.sero.sessions.delete(session.path)`.
3. Create one new visible session.

Do not delete sessions from other workspaces.

### Fix native-folder click handling

Do not use the current post-click pulse assertion for `Install from folder`.

The native dialog prevents that DOM check from working reliably.

Keep `clickForDemo()` unchanged for ordinary renderer controls.

For the native button:

1. Confirm the button is visible.
2. Confirm the recorder is ready.
3. Move the rendered cursor to the button center.
4. Click the button normally.
5. Select the folder through `osascript`.
6. Wait for installation to finish.
7. Do not fabricate a verified pulse count.

The video can cut across the native folder picker.

Sero’s recorder captures Electron content, not the macOS-owned picker.

Do not claim one-click installation.

### Verify the generated report

After installation:

1. Open `Release Checklist`.
2. Click `Generate report`.
3. Wait for `Latest release` inside `Release readiness report`.
4. Confirm `release-readiness.md` exists.
5. Show the report before the ending caption.

## Rejected recording assets

All recording files are outside Git.

Current files include:

- `~/Movies/sero-demos/plugin-build-raw.mp4`
- `~/Movies/sero-demos/plugin-use-raw.mp4`
- `~/Movies/sero-demos/plugin-build-paced.mp4`
- `~/Movies/sero-demos/plugin-use-1080p.mp4`
- `~/Movies/sero-demos/plugin-build.mp4`
- `~/Movies/sero-demos/plugin-build-review.jpg`
- `~/Movies/sero-demos/plugin-build-rejected-caption.mp4`
- `~/Movies/sero-demos/streaming-recorder-smoke.mp4`

The current assembled `plugin-build.mp4` passed technical validation.

Observed result:

- Duration: `76.266667` seconds
- Codec: `h264`
- Pixel format: `yuv420p`
- Resolution: `1720x1080`
- Frame rate: `30 FPS`
- Black segments: none
- Frozen segments: none

It is still rejected.

Reason:

The contact sheet shows an older Release Checklist panel before the prompt.

Do not publish or present this file as accepted footage.

Keep these files until a clean replacement passes review.

Remove rejected assets only after the clean video is accepted.

## Clean recording procedure

First, make the offline script fixes.

Then run focused checks:

```bash
cd apps/desktop
pnpm exec vitest run electron/__tests__/features/apps/app-control-host-service.test.ts
pnpm exec vitest run src/components/layout/AppStoreDialog.test.tsx
pnpm exec tsc --noEmit
pnpm exec tsc -p tsconfig.electron.json --noEmit
```

Build Electron:

```bash
cd apps/desktop
pnpm run build:electron
```

Start exactly one Sero process:

```bash
cd apps/desktop
SERO_DEV_PLUGINS=orchestrator,git,admin \
SERO_ELECTRON_ARGS="--remote-debugging-port=9222" \
SERO_HOME_OVERRIDE="$HOME/.sero-ui" \
bash scripts/dev.sh
```

Confirm only one Electron process uses port `9222`.

Run the complete recording:

```bash
cd apps/desktop
SERO_E2E_EXISTING_CDP=9222 \
pnpm exec playwright test e2e/flagship-demo.agent.spec.ts \
  --project=agent \
  --retries=0
```

Do not edit files while the visible build prompt runs.

Do not open another Sero process.

If the build succeeds, continue through installation and report generation.

## Final video review

The automation must produce:

`~/Movies/sero-demos/plugin-build.mp4`

It must also retain:

`~/Movies/sero-demos/plugin-build-raw.mp4`

Create:

`~/Movies/sero-demos/plugin-build-review.jpg`

Review the contact sheet manually.

Reject the video unless all conditions are true:

- Explorer or the small demo project appears before the prompt.
- Release Checklist does not exist before the prompt.
- Only one fresh demo session appears.
- The opening caption uses the approved sentence.
- The visible prompt uses normal user language.
- No timer appears.
- No internal dependency instructions appear.
- The build finishes visibly.
- The App Store shows `Install from folder`.
- The installed Release Checklist opens.
- `Generate report` visibly runs.
- A real report appears.
- The ending caption uses the approved sentence.
- The cursor remains visible.
- Ordinary clicks show the blue ripple.
- No black or frozen sections exist.
- The final duration stays between `60` and `90` seconds.
- The final video uses H.264 and `yuv420p`.
- The final resolution is `1080p`.
- The final frame rate is `30 FPS`.

Do not claim success from automated validation alone.

The contact sheet must also make visual sense.

## Documentation corrections

Review these files after the clean video succeeds:

- `docs/marketing/restart-checklist.md`
- `docs/marketing/demo-scripts/flagship-reproduction.md`

The old installation blocker is no longer accurate.

Sero now has a verified visible `Install from folder` action.

The approval blocker still exists.

Do not claim a visible approval gate.

The flagship claim can describe creating, installing, opening, and using the plugin.

It must not describe approval.

Write all instructions for a reader with no earlier conversation context.

## Working-tree safety

Current modified or untracked files include recording, installation, documentation, and Orchestrator work.

Do not reset the working tree.

Do not delete unknown changes.

Do not use `git checkout`, `git restore`, or destructive cleanup against these files.

Review every change group before deciding its fate.

The current status includes:

- `AGENTS.md`
- Recording E2E files
- Recording helpers
- Electron recorder files
- App Store installation files
- IPC type files
- Marketing documents
- Orchestrator runtime files
- Orchestrator tests

The Orchestrator files came from earlier repair work.

They are not part of the final video feature.

Review them separately.

Do not include them in a video-related commit without explicit approval.

## Verification before any proposed commit

Run focused tests first.

Then run the root typecheck:

```bash
pnpm typecheck
```

Check every touched source file remains below `500` lines.

Run:

```bash
git diff --check
```

Do not create a commit until Dan explicitly approves the exact file set.

Do not push.

Do not deploy.

Do not publish launch assets.

## Completion report

Return one short report with:

1. The accepted video path.
2. The raw video path.
3. The contact-sheet path.
4. Exact duration, size, codec, pixel format, resolution, and frame rate.
5. Focused test results.
6. Root typecheck result.
7. Remaining uncommitted file groups.
8. Any honest launch blocker.

Do not call the video accepted if the old panel appears before the prompt.
