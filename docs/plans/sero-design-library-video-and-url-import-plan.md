# Sero Design Library Video and URL Import Implementation Plan

**Status:** Proposed
**Date:** 2026-07-31
**Specification:** `docs/specs/sero-design-library-video-and-url-import-spec.md`
**Decisions:** `docs/decisions/sero-design-library-video-and-url-import-decisions.md`
**Base branch:** `main`

---

## 1. Delivery rules

- Start implementation from a fresh branch.
- Keep the first-release authorities closed.
- Keep `AGENTS.md` untouched.
- Check `@sero-ai/ui` before a new control is created.
- Keep every source file below 500 lines.
- Use ASD-STE100 Simplified Technical English.
- Add or update user documentation before the pull request.
- Run React Doctor before each commit that changes React code.
- Run root `pnpm typecheck` before every commit.
- Use Conventional Commit messages.
- Do not wait for or monitor GitHub Actions.

This work changes `packages/common` and can change `packages/app-runtime`.
Those packages may need publication before an external Design Library plugin
can use the new host contract.

## 2. Implementation shape

The work has three independent layers:

1. Generic host full-page capture.
2. Plugin storage and request contracts.
3. Video and URL user flows.

Implement the host contract before the plugin depends on it. Implement record
normalisation before new records can be written.

## 3. Phase 0 · Receipts and contract proof

### 3.1 Full-page capture proof

- [ ] Extract the reusable browser-operation layer below
  `automation_browser`.
- [ ] Capture the test page set with the existing full-page option.
- [ ] Record:
  - navigation and capture time;
  - peak host memory;
  - full-page dimensions;
  - PNG bytes;
  - behavior on fixed headers;
  - behavior on lazy content;
  - behavior on an infinite page;
  - behavior when the page never becomes idle.
- [ ] Confirm that one full image plus ordered sections gives the Librarian
  readable page structure and detail.
- [ ] Choose time, pixel, height, byte, and section-count limits from the
  results.
- [ ] Add the receipts and final values to the decision file before the first
  code commit that enforces them.

Test pages must include:

- a short static page;
- a long editorial page;
- a dense dashboard;
- a page with lazy images;
- a page with a fixed header;
- an infinite-scroll fixture;
- a local development URL;
- a failed navigation.

### 3.2 Video import proof

- [ ] Test renderer decode and frame extraction on each release platform.
- [ ] Include supported and unsupported codec fixtures in MP4 and WebM
  containers.
- [ ] Record:
  - validation time;
  - frame-extraction time;
  - peak renderer memory;
  - original file bytes;
  - duration and dimensions;
  - upload time through bounded chunks.
- [ ] Choose separate video byte and duration limits from the results.
- [ ] Confirm that chunk upload does not hold the full original in renderer
  memory.
- [ ] Add the receipts and final values to the decision file.

**Accept when:** The implementation has measured limits and a stable generic
capture contract. No product code depends on a guessed limit.

## 4. Phase 1 · Generic host web capture

### 4.1 Shared contracts

- [ ] Add renderer-safe web-capture types to `@sero-ai/common`.
- [ ] Add optional `webCapture` to `AppRuntimeHost`.
- [ ] Add a host capability name only if compatibility checks need one. Do not
  make it required by the full Design Library plugin.
- [ ] Use opaque artifact handles. Do not expose arbitrary host paths.
- [ ] Add capture, bounded read, release, cancellation, progress, and
  availability contracts.
- [ ] Keep all imports top-level.

The read contract must enforce its requested byte limit. A caller repeats the
read while the result has a next offset.

### 4.2 Host implementation

- [ ] Move shared `agent-browser` command execution below the agent tool.
- [ ] Keep `automation_browser` on the shared implementation.
- [ ] Add a background-runtime adapter for:
  - URL navigation;
  - ready wait;
  - full-page screenshot;
  - metadata extraction;
  - ordered analysis-section capture;
  - cancel;
  - artifact release.
- [ ] Use the existing browser-pack resolver and Doctor state.
- [ ] Keep browser and FFmpeg installs in the machine-shared host toolchain.
- [ ] Store captures in a bounded host temporary directory.
- [ ] Remove abandoned capture artifacts at host startup.
- [ ] Reject non-HTTP and non-HTTPS navigation.
- [ ] Never return cookies, headers, storage, or page HTML.

### 4.3 Host tests

- [ ] Contract tests with a fake web-capture backend.
- [ ] Browser adapter tests for command arguments, `--full`, viewport, timeout,
  cancel, and cleanup.
- [ ] Tests for redirect metadata.
- [ ] Tests for partial capture metadata.
- [ ] Tests for invalid scheme and failed navigation.
- [ ] Tests for a missing or unhealthy browser pack.
- [ ] Tests that `automation_browser` still uses the same shared service.

**Accept when:** A test runtime can request a full-page capture, read each
artifact in bounded pieces, and release all artifacts. Browser tool behavior
does not regress.

## 5. Phase 2 · Plugin record and ingestion contracts

### 5.1 Records

- [ ] Add `webpage` to `ItemSourceKind`.
- [ ] Add a discriminated webpage source record with capture provenance.
- [ ] Add ordered `analysisFiles` to `ItemAsset`.
- [ ] Increment the item schema version.
- [ ] Keep old image and video records readable.
- [ ] Project webpage provenance into lightweight item summaries.
- [ ] Add `webpage` to source filters and source labels.
- [ ] Keep exact duplicate detection on the original checksum.

Do not cast an unknown source kind into the union during normalisation.
Validate each known source shape.

### 5.2 Runtime requests and jobs

- [ ] Add a persisted `web.capture` request.
- [ ] Add a job target that exists before the captured item exists.
- [ ] Record queued, running, preparing, succeeded, failed, cancelled, and
  partial outcomes.
- [ ] Pass `AbortSignal` from the coordinator to the host capture.
- [ ] Make retry explicit. Restart recovery must not repeat network capture.
- [ ] Project capture progress into the Library grid.

### 5.3 Common ingestion core

- [ ] Extract item creation from upload assembly into one ingestion candidate
  function.
- [ ] Feed current image uploads, video uploads, generated media, and host
  capture artifacts through that function.
- [ ] Hash the original while it is read.
- [ ] Write item files to a temporary item directory.
- [ ] Rename the complete directory atomically.
- [ ] Remove the temporary directory on failure.
- [ ] Release host capture handles in a `finally` path.
- [ ] Keep staging cleanup and exact duplicate behavior.

**Accept when:** Old records still load, one runtime function creates every
Library item, and interrupted capture cannot leave a visible half-item.

## 6. Phase 3 · Video import

### 6.1 Import library

- [ ] Split image preview and video preparation into small media-specific
  modules.
- [ ] Change original upload to read ordered `Blob.slice()` chunks.
- [ ] Keep each tool call within `UPLOAD_CHUNK_BYTES`.
- [ ] Add byte progress without reading the full file.
- [ ] Add video metadata validation.
- [ ] Reuse `captureFrames` for poster, filmstrip, dimensions, and duration.
- [ ] Begin one video upload with original, preview, and frames roles.
- [ ] Send all roles before completion.
- [ ] Abort staging after validation, upload, or completion failure.

### 6.2 Tool boundary

- [ ] Permit validated `video/*` imports in `design_library_assets`.
- [ ] Do not trust the renderer's `kind`; derive and validate kind from the
  accepted media type.
- [ ] Enforce separate image and video limits in upload verification.
- [ ] Require poster and filmstrip roles for imported video completion.
- [ ] Keep delayed `awaitingFrames` behavior for generated videos only.
- [ ] Update the asset tool description and parameter tests.

### 6.3 UI

- [ ] Extend the existing hidden file input accept value.
- [ ] Apply the same import rules to file picker and drag-and-drop.
- [ ] Show each file's validation and upload progress.
- [ ] Show a clear decode, limit, cancel, or upload error.
- [ ] Keep imported video in the current Library grid.
- [ ] Reuse the existing video viewer and controls.
- [ ] Confirm that selection as a Design reference works without special UI.

Check `@sero-ai/ui` before any progress, alert, or action control is added.

### 6.4 Video tests

- [ ] Import helper tests for image and video classification.
- [ ] Tests that chunk reads use `Blob.slice()`.
- [ ] Tests for decode failure, zero dimensions, invalid duration, byte limit,
  and duration limit.
- [ ] Tests for poster and filmstrip upload roles.
- [ ] Runtime tests for imported video ingestion and duplicate detection.
- [ ] Librarian tests that receive the filmstrip and duration, not video bytes.
- [ ] UI tests for picker, drop, progress, cancel, and error.
- [ ] Regression tests for generated video frame attachment.

**Accept when:** A supported video imports, analyses, plays, and works as a
Design reference. An unsupported video creates no item. The renderer never
buffers the full original.

## 7. Phase 4 · URL import

### 7.1 Runtime capture

- [ ] Add the URL capture request handler to the coordinator.
- [ ] Check host capture availability before the request starts.
- [ ] Apply the URL and viewport rules.
- [ ] Forward progress and cancel.
- [ ] Ingest the full-page original, preview, and ordered analysis sections.
- [ ] Store redirect and capture provenance.
- [ ] Mark limited results as partial.
- [ ] Release every host artifact after ingestion or failure.

### 7.2 Librarian

- [ ] Select webpage analysis files for a webpage item.
- [ ] Keep their page order.
- [ ] Add a short caption with page position and full-page dimensions.
- [ ] Send each image through `host.media.prepareImage`.
- [ ] Keep the existing one-image and video-filmstrip paths unchanged.
- [ ] Add a prompt rule that describes visible design only and does not infer
  hidden page content.

### 7.3 UI

- [ ] Add **Import website** to the existing import menu.
- [ ] Use the shared Dialog, Input, Select, Button, Progress, and notification
  controls from `@sero-ai/ui`.
- [ ] Keep the dialog compact. Do not add repeated help text.
- [ ] Validate the URL before queueing the request.
- [ ] Show capture stages in the grid and dialog.
- [ ] Let the user cancel and retry.
- [ ] Show a partial badge when applicable.
- [ ] Show webpage provenance in the inspector.
- [ ] Add **Open original page** through the generic safe-link host action.
- [ ] Disable only URL import when host web capture is unavailable.

### 7.4 URL tests

- [ ] URL validation tests.
- [ ] Coordinator success, redirect, partial, cancel, retry, and restart tests.
- [ ] Artifact cleanup tests for every exit.
- [ ] Ingestion and checksum duplicate tests.
- [ ] Record normalisation tests for old and new source shapes.
- [ ] Librarian ordered-section tests.
- [ ] UI tests for dialog validation, progress, cancel, partial, failure, and
  unavailable host capability.
- [ ] Security tests that no HTML, cookie, header, or arbitrary host path is
  persisted.

**Accept when:** A public URL creates one inert full-page Library item with
readable analysis and complete provenance. Partial results are honest. The
rest of the plugin works without browser capture.

## 8. Phase 5 · Documentation and verification

- [ ] Update `apps/docs-site/docs/plugins/design-library.md`.
- [ ] Remove the statement that user video import is unsupported.
- [ ] Document supported-video validation without promising codecs by file
  extension.
- [ ] Document full-page URL capture, partial results, and the isolated browser
  session.
- [ ] Document that authenticated visible-tab capture is not supported yet.
- [ ] Update the Design Library authority list where it is maintained.
- [ ] Check every touched source file is below 500 lines.
- [ ] Run focused plugin, common-package, app-runtime, and desktop tests.
- [ ] Run plugin build and typecheck.
- [ ] Run React Doctor and complete its regression check.
- [ ] Run root `pnpm typecheck`.
- [ ] Run the manual test matrix below.

### 8.1 Manual video matrix

- Select one supported video.
- Drop several supported videos.
- Try an unsupported codec.
- Try a file over the measured byte limit.
- Try a file over the measured duration limit.
- Cancel during upload.
- Import the same file twice.
- Open, play, favourite, collect, search, delete, restore, and use the item in a
  Design.

### 8.2 Manual URL matrix

- Capture a short public page.
- Capture a long page.
- Capture a page with redirects.
- Capture a local development page.
- Capture a lazy-load fixture.
- Capture an infinite-scroll fixture.
- Cancel during navigation and during capture.
- Retry a failed capture.
- Capture the same page twice without changes.
- Capture the same URL after a visible change.
- Start Sero without the browser pack and confirm only URL import is
  unavailable.

## 9. Commit order

Each commit must pass root `pnpm typecheck`. React commits must also pass React
Doctor.

1. `docs(design-library): specify video and URL imports`
2. `feat(runtime): add generic full-page web capture`
3. `feat(design-library): add webpage capture records`
4. `feat(design-library): import video references`
5. `feat(design-library): import full-page URL captures`
6. `docs(design-library): document video and URL imports`

If a phase needs more than one commit, keep each commit independently valid and
use the same Conventional Commit scope.

## 10. Final release gate

The enhancement is complete only when:

- all specification acceptance criteria pass;
- measured limits and receipts are in the decision file;
- no source file exceeds 500 lines;
- React Doctor has no unresolved regression;
- root `pnpm typecheck` passes;
- documentation matches the shipped behavior;
- the plugin has no browser or transcoder dependency;
- URL capture is optional and does not block plugin load;
- old Library records and existing imports still work.
