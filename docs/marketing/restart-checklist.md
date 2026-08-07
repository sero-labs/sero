# What this branch needs before a public Sero launch

## What this branch is for

This branch prepares Sero for its first public launch.

The launch needs proof that people can see and trust:

1. Sero can do useful work.
2. A new user can install Sero and get a useful answer.
3. Someone outside this project can repeat that experience.

The first proof is a short product video.

The second proof is a timed first-use video.

The third proof is one outside tester.

## What is already done

The built-in Sero recorder works.

It saves an MP4 file.

The video includes a visible mouse cursor.

The video includes a blue circle when you click.

The recorder streams frames to `ffmpeg` while it records.

A long recording no longer exhausts Sero's memory.

The App Store has a visible **Install from folder** action.

That action installs a plugin package from a folder you select.

You do not need to test the recorder again before recording the videos below.

## Your next task: record Sero creating and using a plugin

A **Sero plugin** is a separate package that Sero can install.

A plugin can add a panel to the Sero window.

It can also add Pi tools or background work.

This video shows Sero creating a plugin from one request.

It then shows a person installing and using that plugin.

The plugin is named **Release Checklist**.

The panel inspects a Git repository and creates a release report.

The report includes the latest release, recent commits, open pull requests, and
blocking issues.

### Important limit

Do not claim an approval gate.

Sero has no setting that reliably creates an approval card for this task.

Do not call the installation one click. You select the folder yourself.

### How the recording runs

The recording is automated. You start one Sero process, then start the test.

The test drives the whole demo and writes the finished video.

Before recording, the test cleans the stage:

1. It uninstalls any earlier Release Checklist plugin.
2. It deletes older sessions in the demo workspace.
3. It opens Explorer, so no plugin panel is on screen.

### Set up the machine

1. Close every running Sero process.
2. Connect a model in Sero.
3. Keep your hands off the keyboard and mouse during the run.

The run sends keystrokes to a macOS folder picker. Typing at the same time
breaks it.

### Build and start Sero

```bash
cd apps/desktop
pnpm run build:electron
```

```bash
cd apps/desktop
SERO_DEV_PLUGINS=orchestrator,git,admin \
SERO_ELECTRON_ARGS="--remote-debugging-port=9222" \
SERO_HOME_OVERRIDE="$HOME/.sero-ui" \
bash scripts/dev.sh
```

Confirm only one Electron process uses port `9222`.

### Record the video

```bash
cd apps/desktop
SERO_E2E_EXISTING_CDP=9222 \
pnpm exec playwright test e2e/flagship-demo.agent.spec.ts \
  --project=agent \
  --retries=0
```

The build turn takes about eleven minutes. The test speeds that part up and
labels it as a timelapse.

The test writes these files:

- `~/Movies/sero-demos/plugin-build.mp4` — the finished video.
- `~/Movies/sero-demos/plugin-build-raw.mp4` — the complete raw recording.
- `~/Movies/sero-demos/plugin-build-review.jpg` — a contact sheet for review.
- `~/Movies/sero-demos/plugin-build.json` — what the run measured.

### Rehearse the steps after the build

A full run costs about eleven minutes. Most failures happen after the build, in
the install and report steps. Rehearsal mode reuses the plugin the last run
built and skips the build, so those steps take about one minute to test.

```bash
cd apps/desktop
SERO_E2E_EXISTING_CDP=9222 \
SERO_DEMO_REHEARSE=1 \
pnpm exec playwright test e2e/flagship-demo.agent.spec.ts \
  --project=agent \
  --retries=0
```

Rehearsal mode needs a plugin from an earlier run. Without one, the test stops
and says so.

A rehearsal video has no build in it. Never publish one. Every rehearsal file
carries a `rehearsal-` prefix, so it cannot overwrite the real recording.

### Review the video before you use it

Open the contact sheet. Reject the video unless every statement is true:

- No Release Checklist panel appears before the prompt.
- Only one fresh session appears in the sidebar.
- The build finishes on screen.
- The App Store shows `Install from folder`.
- The installed Release Checklist panel opens.
- `Generate report` runs and a real report appears.
- The cursor stays visible and ordinary clicks show the blue circle.
- No black or frozen sections exist.

Automatic checks alone are not enough. The pictures must also make sense.

### Publish the video

Use this caption:

```text
Sero built a standalone Sero plugin from one prompt, then ran it.
```

Do not say that you approved an action.

Do not say that installation is one click.

## Next task: record a new-user journey

This video proves that a new person can start using Sero.

Use a Mac that does not have Sero installed.

1. Start a visible timer at `00:00`.
2. Download the macOS Apple Silicon release.
3. Install Sero.
4. Create a profile.
5. Connect one model.
6. Add a real Git repository as the workspace.
7. Ask this question in Sero:

   ```text
   Look at this repo and tell me how it's structured.
   ```

8. Show Sero reading files.
9. Show one terminal command.
10. Show Sero's first useful answer.
11. Keep the timer visible.
12. Label every sped-up part as a timelapse.

The final video must show the real time from download to first useful answer.

## Then ask one person outside this project to test Sero

Ask a friend, colleague, or community member to use Windows or Linux.

Give them the release link and quick-start guide.

Ask them to record these facts:

1. Their operating system and computer type.
2. The release file they downloaded.
3. The time from download to first useful answer.
4. Every problem they hit.

Add their result to `docs/marketing/metrics-log.md`.

If they cannot complete the journey, fix the problem before making bigger public claims.

## After you have the two videos and outside test

1. Turn the strongest video into a web video or GIF.
2. Put it at the top of the README.
3. Put it on the Sero homepage.
4. Keep the original MP4 files outside this repository.
5. Save one strong video for the Hacker News launch.

## Then open the Early Builders community

**Early Builders** means the first people who help improve Sero.

Do these steps in GitHub:

1. Check whether `sero-labs/sero-logbook-plugin` already exists.
2. Create it only if it does not exist.
3. Create these labels in `sero-labs/sero`:
   - `good first plugin`
   - `good first loop`
   - `demo wanted`
   - `docs wanted`
4. Create an issue named **Help us build the first 25 Sero loops**.
5. Create and pin a GitHub Discussion named **Sero 100 Early Builders**.
6. Publish the first builder log after the Discussion is public.

## Then publish the prepared posts

Publish in this order:

1. The flagship social post and thread, with the plugin-build video.
2. Three or four follow-up posts.
3. The Pi community feedback post, with the video link.
4. The first weekly builder log.

Record stars, traffic, and downloads for 48 hours after each post.

## Before a pull request

A **pull request** is the review request for this branch.

These code fixes are complete:

1. `apps/desktop/e2e/marketing-loops.agent.spec.ts` is under 500 lines. Its
   mechanics moved to `apps/desktop/e2e/helpers/marketing-loops.ts`.
2. `apps/homepage/functions/api/subscribe.ts` describes the bound KV namespace.
3. `apps/homepage/functions/api/subscribe.test.ts` covers an invalid email, a
   missing KV binding, and a successful write.
4. The demo smoke test fails when a panel switch does not come from a click.
5. The recorder is a CLI feature, not a UI feature. See AD-027 in
   `docs/decisions.md`.

Then run the targeted tests and `pnpm typecheck` from the repository root.

Create the pull request as a draft.

## Before the Hacker News launch

Hacker News is the final public launch.

Do not post until these statements are true:

1. The README and homepage show the same release status.
2. The video is visible on both pages.
3. One Windows or Linux tester completed the journey.
4. You have a video held back for Hacker News.
5. The security FAQ is approved.

Then publish the prepared Show HN post.

Stay available to answer comments that day.

Record rank, comments, stars, traffic, and downloads for 48 hours.

## After Hacker News

1. Publish community posts.
2. Open useful awesome-list pull requests.
3. Send newsletter pitches.
4. Publish a weekly builder update for four weeks.
5. Review the new-user funnel every week.
