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

You do not need to test the recorder again before recording the videos below.

## Your next task: record Sero creating a plugin

A **Sero plugin** is a separate package that Sero can install.

A plugin can add a panel to the Sero window.

It can also add Pi tools or background work.

This video shows Sero creating a plugin from one request.

The plugin is named **Release Checklist**.

After installation, it would add a panel named **Release Checklist**.

The panel would inspect a Git repository and create a release report.

The report would include the latest release, recent commits, open pull requests, and blocking issues.

### Important limit

Do not try to show the plugin running inside Sero.

Sero does not currently give you a screen button to install a plugin from a folder.

Do not try to show an approval card.

Sero has no setting that reliably creates that card for this task.

This video ends when Sero creates the plugin files.

### Set up the screen

1. Open Sero.
2. Open a real Git repository as the workspace.
3. Use a repository that has releases, pull requests, and issues.
4. Connect a model.
5. Open the workspace chat.
6. Keep the repository file tree visible.

### Record the video

1. Open a terminal outside the repository.
2. Start the recorder:

   ```bash
   sero app record start --fps 15 --full-window --crf 18
   ```

3. Return to the Sero chat.
4. Paste this exact message:

   ```text
   Build a standalone Sero plugin in a new top-level folder named `release-checklist-plugin`.

   Give it a UI panel named `Release Checklist`.

   The panel must create a release readiness report for this repository.

   The report must contain:

   - The latest release tag.
   - Commits since that tag.
   - Working-tree status.
   - Open pull requests.
   - Release-blocking open issues.

   Add one `Generate report` action.

   The action must write `release-readiness.md` in the workspace root.

   The panel must show the same report.

   Use only published versioned dependencies.

   Do not use any `workspace:*` dependency.

   Do not import `@sero-ai/ui`.

   Use plain React with a local `cn()` helper.

   Build the plugin.

   Do not install it.

   Do not commit, push, or post anything.
   ```

5. Wait for Sero to finish.
6. If the wait takes more than one minute, speed up only the waiting part.
7. Put the real elapsed time over the sped-up part.
8. In the file tree, open `release-checklist-plugin/package.json`.
9. Show the `sero.app` section in that file.
10. Stop the recorder:

   ```bash
   sero app record stop --save ~/Movies/sero-demos/plugin-build.mp4
   ```

### Edit and publish the video

Use this caption:

```text
Sero built a standalone Sero plugin from one prompt.
```

Do not say that Sero installed or ran the plugin.

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

Complete these code fixes first:

1. Split `apps/desktop/e2e/marketing-loops.agent.spec.ts` into files below 500 lines.
2. Correct the stale comment in `apps/homepage/functions/api/subscribe.ts`.
3. Test invalid email, missing KV storage, and successful KV writes.
4. Make the demo smoke test fail when panel switching fails.
5. Decide whether the recording IPC is only for tests or for people using Sero.
6. If people use it, complete the renderer, Zustand, preload, main-process, and Pi SDK layers.

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
