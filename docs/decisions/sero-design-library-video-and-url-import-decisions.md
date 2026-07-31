# Sero Design Library Video and URL Import Decisions

**Status:** Proposed
**Date:** 2026-07-31
**Specification:** `docs/specs/sero-design-library-video-and-url-import-spec.md`
**Implementation plan:** `docs/plans/sero-design-library-video-and-url-import-plan.md`

---

## D1 · Restore the two deferred import sources

User video import and URL capture move into scope.

This decision revises D4 and the deferred list in
`sero-design-library-first-release-decisions.md`. Generated video support
proved the video storage, playback, poster, filmstrip, and motion-analysis
model. Sero also now has managed browser automation with full-page capture.

The closed first-release documents stay as the record of that release.

## D2 · Video import reuses the current renderer frame pipeline

The renderer validates and decodes an imported video before upload. It uses the
current `captureFrames` flow to create the poster and filmstrip.

The runtime does not decode video. The plugin does not add FFmpeg or another
decoder. Unsupported codecs fail before item creation.

**Why:** This is the same path that generated videos use after download. A
second decoder would add size, platform work, and different output.

**Consequence:** Accepted codecs follow the Chromium build on that platform.
The UI reports the decode result instead of promising support from a file
extension.

## D3 · Large imports use bounded file slices

Video upload reads `Blob.slice()` chunks. It does not call
`file.arrayBuffer()` for the full original.

Image and video byte limits are separate. The implementation records memory,
time, and file-size receipts before it sets the first video limits.

**Why:** The current whole-file read is suitable for bounded images but is a
landmine for large video files.

## D4 · Imported sources are immutable

Import stores the original video unchanged. It stores a full-page PNG as the
original webpage capture.

Posters, previews, filmstrips, and webpage analysis sections are derived files.
They can be rebuilt without changing source identity.

Future remix and extend operations create derived assets with lineage. They do
not replace the imported source.

## D5 · URL import is image capture, not webpage import

A URL import creates one inert image Library item. It does not store HTML,
scripts, browser state, or a runnable archive.

The item owns a full-page original and bounded derived images. Ordered page
sections give the Librarian readable detail.

**Why:** The feature exists to collect visual language. Live webpage storage
adds security, expiry, and reproducibility problems that do not improve that
goal.

## D6 · Full page is the only capture extent in the first release

The URL dialog asks for a URL and a viewport preset. It captures the full page.
It does not make the user choose between visible area and full page.

The host sets hard capture limits. A capture that reaches a limit is valid but
must be labelled as partial.

**Why:** A viewport image often misses the page structure that makes the
reference useful. A clear partial result is better than a silent crop.

## D7 · The host owns browser capture

Add one optional generic background-runtime web-capture capability. Implement
it below the existing `automation_browser` tool and reuse the managed browser
adapter and full-page screenshot support.

The Design Library owns capture requests, item records, provenance, ingestion,
analysis, and UI. It does not own browser launch, browser installation,
navigation, or screenshot mechanics.

The plugin must not:

- import desktop source;
- call private browser IPC;
- install a browser or driver;
- shell out to `agent-browser`;
- call the `automation_browser` agent tool from a plugin tool.

**Why:** Browser capture is useful to more than one plugin. The browser pack is
already machine-shared and host-managed.

**Consequence:** URL import can be unavailable while the rest of Design
Library continues to work. The UI reports host capability state.

## D8 · Direct URL capture uses an isolated browser session

The first release captures a pasted URL through the host automation browser.
It does not reuse the user's visible Browser cookies or logged-in state.

Capture from an authenticated visible Sero Browser tab stays deferred until
Sero has a generic page-sharing or active-tab capture surface for plugins.

**Why:** A direct URL has a clear security boundary and already matches the
existing full-page browser capability. Copying user browser state into hidden
automation would be unsafe and surprising.

## D9 · Webpage source identity uses pixels, not URL

Duplicate detection continues to use the original asset checksum.

Two captures of one URL can create different items when the page changed.
Two exact captures open the same item even when redirect or tracking URL text
differs.

**Why:** The Library stores a visual reference at one time. A URL is
provenance, not content identity.

## D10 · Creative video operations remain separate work

This enhancement stores enough metadata and lineage for later `video-to-video`
and `video-extend` capabilities. It does not implement them.

Provider and model names remain adapter details. Future work must use
capability names and must define audio behavior before implementation.

