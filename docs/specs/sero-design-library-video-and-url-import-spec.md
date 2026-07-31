# Sero Design Library Video and URL Import Specification

**Status:** Proposed
**Package:** `@sero-ai/plugin-design-library`
**Directory:** `plugins/sero-design-library-plugin`
**Scope:** User video import and full-page URL import
**Extends:** `docs/specs/sero-design-library-plugin-spec.md`
**Decisions:** `docs/decisions/sero-design-library-video-and-url-import-decisions.md`
**Implementation plan:** `docs/plans/sero-design-library-video-and-url-import-plan.md`

---

## 1. Purpose

The Design Library can already import images and can store, play, preview, and
analyse generated videos. This enhancement adds two import sources:

- video files supplied by the user;
- full-page images captured from a URL.

Both sources become normal Library items. They use the existing search,
collections, favourites, analysis, deletion, and Design reference flows.

This specification replaces only these deferred first-release decisions:

- user video import is deferred;
- URL and webpage capture are deferred.

The closed first-release specification and plan stay unchanged.

## 2. Product principles

**Reuse Sero.** Browser work belongs to the Sero host. Video decoding uses the
current renderer media pipeline. The plugin must not install or bundle its own
browser, browser driver, or video tool.

**Store inert references.** A webpage import stores images and provenance. It
does not store or run page HTML, scripts, cookies, or remote resources.

**Keep originals.** An imported video and a full-page capture are immutable
source assets. Derived previews and analysis images can be rebuilt.

**Use one Library model.** Imported images, imported videos, generated media,
and webpage captures use the same item, analysis, search, and deletion
contracts.

**Keep provider details outside the plugin domain.** Web capture asks for a
capability. It does not know whether the host uses Electron, Chromium,
`agent-browser`, or another browser provider.

## 3. Scope

### 3.1 In scope

- Video import from the file picker and drag-and-drop.
- Video validation before upload.
- Video poster and filmstrip extraction.
- Video playback in the Library inspector.
- Full-page capture from a pasted HTTP or HTTPS URL.
- One inert Library item for each completed webpage capture.
- A full-page original, a bounded card preview, and readable analysis sections.
- Source URL, final URL, page title, capture date, and viewport provenance.
- Clear progress, failure, cancel, retry, and partial-capture states.
- Exact duplicate detection through the original asset checksum.
- A generic Sero host web-capture capability.
- Records that can support later video remix and extend work without changing
  the imported source.

### 3.2 Out of scope

- Video remix, extend, restyle, trim, or generation from an imported video.
- Video transcoding or repair.
- Audio editing or analysis.
- Clipboard video import.
- Live HTML import, DOM storage, page archives, or executable webpage previews.
- Site crawling or capture of more than one URL per request.
- Scheduled webpage recapture.
- Automatic removal of cookie banners, adverts, or modal windows.
- Capture from an authenticated visible Sero Browser tab.
- Mobile and desktop captures in one import.
- Semantic or embedding search.

The out-of-scope video operations are expected follow-on work. Section 8
defines the data that they will need.

## 4. Video import

### 4.1 Entry points

The shared Library import control accepts supported images and videos. A user
can select files or drop files on the Library.

The picker and drop target must use the same media-type rules. Unsupported
files must stay out of the upload queue.

### 4.2 Validation

The renderer must load video metadata before upload. It must confirm that:

- Chromium can decode the file;
- the video reports non-zero dimensions;
- the duration is finite and greater than zero;
- the file is within the configured size and duration limits.

The UI must not claim that all files with one container extension will work.
Codec support can differ by platform. The decode result is the authority.

If validation fails, the UI shows the file name and a short cause. It does not
create a Library item and does not leave staged upload data.

The implementation plan includes a platform test and a memory test before it
sets the first size and duration limits. The limits must have measured
receipts. They must not be unexplained constants.

### 4.3 Derived images

The existing renderer frame pipeline produces:

- one WebP poster for cards and the inspector;
- one WebP filmstrip with ordered samples for the Librarian;
- width, height, and duration metadata.

The import must finish frame extraction before it queues ingestion. Imported
videos do not need the delayed `awaitingFrames` path used by generated videos.

The original video, poster, and filmstrip enter the same bounded staging
upload. The runtime stores them atomically as one item.

### 4.4 Upload behavior

The renderer must not load a full video into one `ArrayBuffer`. It reads and
sends bounded `Blob.slice()` chunks in order.

The upload reports progress from bytes sent. Cancel removes the staging upload.
Restart cleanup removes an abandoned upload under the existing stale-upload
rules.

Image and video limits are separate. Increasing the video limit must not
increase the image limit.

### 4.5 Item behavior

An imported video:

- has `kind: "video"`;
- keeps its original media type and checksum;
- has source kind `file` or `drop`;
- shows its poster in grids;
- plays the original in the inspector;
- sends its filmstrip and duration to the Librarian;
- can be selected as a Design reference;
- follows the current duplicate, favourite, collection, Trash, and permanent
  deletion rules.

The Librarian describes visual language and motion. It does not claim to
analyse dialogue, music, or other audio.

## 5. URL import

### 5.1 User flow

The Library import menu has an **Import website** action. It opens a compact
dialog with:

- one URL field;
- one viewport choice;
- a **Capture page** action.

Full page is the only capture extent in this release. The default viewport is
the standard desktop capture preset. The selected preset is stored in
provenance.

The UI shows these states:

- opening page;
- waiting for page;
- capturing page;
- preparing reference;
- analysing;
- failed;
- captured partially.

The user can cancel before ingestion. A retry starts a new host capture and
does not reuse a failed browser session.

### 5.2 URL rules

Only explicit HTTP and HTTPS URLs are accepted. Sero applies its existing URL
normalisation and navigation policy.

The capture follows normal redirects. The record stores both the requested URL
and the final URL. Credentials, cookies, request headers, and browser storage
must not enter the Library record.

Local development URLs are allowed because capture is an explicit user action.
The browser isolation and navigation rules remain host-owned.

### 5.3 Capture result

One successful request creates one image Library item. The capture result
contains:

- the full-page PNG;
- a bounded preview for the grid;
- ordered page sections for Librarian analysis;
- requested URL;
- final URL;
- page title;
- capture timestamp;
- viewport width and height;
- captured page width and height;
- completion status and a truncation reason when incomplete.

The full-page PNG is the immutable original. Analysis sections are derived
files. They let the Librarian read a tall page without reducing all text and
detail into one small image.

The UI never shows the sections as separate Library items.

### 5.4 Completion and limits

The host waits for the configured page-ready condition and then captures the
page. It must have hard time, height, pixel, and byte limits.

The host can return a partial capture when the page exceeds a limit. The item
must say that it is partial. The plugin must not present it as a complete page.

An infinite page must stop at the capture limit. A page that never becomes idle
must continue after the ready timeout or fail with a clear cause. It must not
wait without a bound.

The first limit values are set after the implementation plan records capture
time, memory, output size, and model-analysis results for the test page set.

### 5.5 Page state

The capture records the page as the browser rendered it. It does not attempt to
rewrite the page.

This release does not promise to remove:

- fixed or sticky elements;
- cookie notices;
- modal windows;
- adverts;
- animation;
- lazy content that did not load before the capture deadline.

The host may scroll to load deferred content when this does not break the page.
It must restore or dispose of its browser state when capture ends.

### 5.6 Item behavior

A webpage capture:

- has `kind: "image"`;
- has source kind `webpage`;
- uses the final page title as its initial title when available;
- shows the full image in the inspector;
- shows requested URL, final URL, and capture date as source provenance;
- offers **Open original page** through the normal safe external-link action;
- enters Librarian analysis through its ordered analysis sections;
- follows the normal duplicate, favourite, collection, Trash, and deletion
  rules.

Two captures with the same URL can be different items when their image
checksums differ. Exact image duplicates open the existing item.

## 6. Generic host web capture

The plugin must not call desktop IPC or browser tools directly. Sero adds one
generic optional background-runtime capability:

```ts
type WebCaptureSource = {
  kind: 'url';
  url: string;
};

interface WebCaptureOptions {
  extent: 'full-page';
  viewport: { width: number; height: number };
  signal: AbortSignal;
}

interface WebCaptureArtifact {
  role: 'original' | 'preview' | 'analysis-section';
  mediaType: 'image/png' | 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  handle: string;
}

interface WebCaptureResult {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  capturedAt: number;
  viewport: { width: number; height: number };
  page: { width: number; height: number };
  complete: boolean;
  truncationReason?: string;
  artifacts: WebCaptureArtifact[];
}

interface AppRuntimeWebCaptureApi {
  capture(
    source: WebCaptureSource,
    options: WebCaptureOptions,
  ): Promise<WebCaptureResult>;
  read(
    handle: string,
    offset: number,
    limit: number,
  ): Promise<{ data: Uint8Array; nextOffset?: number }>;
  release(handles: string[]): Promise<void>;
}
```

Each read is bounded. The caller repeats the read while `nextOffset` is
present. The contract must not use base64 or reactive state for full-page image
data.

The host implementation reuses the current browser automation adapter and its
full-page screenshot support. Shared capture code must sit below the
`automation_browser` tool so the tool and app runtimes call the same service.
The plugin must not invoke one agent tool from another tool.

Capture artifacts live in the host temporary area. The plugin reads them into
its own storage and calls `release` in success, failure, and cancel paths. Host
startup cleanup removes abandoned capture artifacts.

The capability is optional. A Sero build without web capture still loads the
Design Library. The URL action explains that browser capture is unavailable.

## 7. Plugin request and storage model

URL capture is a persisted runtime request. Closing the Design Library UI does
not lose the request. Runtime restart marks an interrupted capture as
retryable. It does not start a second network capture by itself.

The item source model adds webpage provenance:

```ts
interface WebpageSource {
  kind: 'webpage';
  requestedUrl: string;
  finalUrl: string;
  pageTitle?: string;
  capturedAt: number;
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
  complete: boolean;
  truncationReason?: string;
}
```

The asset model adds derived analysis files:

```ts
interface ItemAsset {
  // Existing fields stay unchanged.
  analysisFiles?: string[];
}
```

`framesFile` remains the video filmstrip. `analysisFiles` is for an ordered set
of webpage sections. The Librarian chooses the correct source by item kind and
source metadata.

Old records without these fields must continue to load.

## 8. Preparation for creative video work

Import does not add video editing, but the record model must not block it.
Future derived media records need:

- immutable source item identity;
- operation capability such as `video-to-video` or `video-extend`;
- selected source time range;
- extend direction;
- prompt and model provenance;
- generated child identity;
- explicit audio handling;
- full parent and child lineage.

The first import release stores the original duration and dimensions. It never
overwrites the source video. A later creative operation creates a new derived
item or Design asset.

Provider names and provider model names must not become operation types.

## 9. Security and privacy

- Only HTTP and HTTPS navigation is allowed.
- Captured HTML and scripts are discarded.
- Captured images never load remote content when viewed.
- Browser credentials and cookies are not copied into plugin state.
- Host capture handles cannot resolve outside the host capture area.
- Item file names cannot create paths outside the plugin state directory.
- Cancel and failure remove staged plugin data and release host artifacts.
- The design-generation model receives Librarian language, not imported video
  bytes or webpage pixels.
- **Open original page** uses the host safe-link action.

## 10. Accessibility and copy

- Every progress state has text and is not colour-only.
- Cancel and retry are keyboard accessible.
- Video controls have accessible names.
- The URL field reports validation errors through its accessible description.
- Partial capture is visible in the card and inspector.
- Copy uses short terms: **Import video**, **Import website**,
  **Capture page**, **Partial capture**, and **Try again**.

## 11. Acceptance criteria

1. A supported dropped or selected video becomes a normal video Library item.
2. Video upload reads bounded slices and does not buffer the full file.
3. The item has a poster, filmstrip, dimensions, duration, and checksum.
4. The Librarian receives the filmstrip and does not receive the video file.
5. An unsupported video creates no item and gives a clear error.
6. A pasted HTTP or HTTPS URL creates one inert full-page image item.
7. A URL item keeps full source provenance and no browser credentials.
8. The Librarian receives readable ordered page sections.
9. A limited capture is stored and labelled as partial.
10. Exact duplicate video or page bytes open the existing item.
11. Cancel, failure, and restart leave no permanent staging or capture files.
12. The plugin contains no browser driver, browser binary, or video
    transcoder.
13. The generic host capture capability has its own contract and tests.
14. A host without web capture can still load and use the rest of the plugin.
15. Existing image import, generated video, Library analysis, and Design
    reference behavior do not regress.
