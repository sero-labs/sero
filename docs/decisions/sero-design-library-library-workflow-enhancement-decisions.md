# Design Library library-workflow enhancement decisions

**Status:** Accepted  
**Date:** 2026-07-30  
**Scope:** Post-first-release Library workflow enhancements

This is a separate decision entry for enhancement work. It does not reopen the first-release decisions.

## E1 · Fresh generation and source-led work are separate flows

The Library header **Generate** action offers text-to-image and text-to-video only. It does not show operations that require a source.

The selected-reference **Remix** action opens a source-led panel. That panel separates operations that create new media from operations that edit the current reference.

**Reason.** The current flat capability row mixes two different user intentions. It also allows a selected source to disappear when the user changes to a capability that cannot use it.

**Consequence.** The dialog receives an explicit mode. It does not infer intent only from the current capability.

## E2 · Remix can create an image or a video from a reference

Remix offers source-aware image and video generation. Image generation uses image-to-image. Video generation uses a new vendor-neutral `image-to-video` capability backed by a configured fal.ai model.

Text-to-video remains the fresh video operation.

**Reason.** A movie based on a reference must send that reference to the provider. Reusing text-to-video would silently ignore it.

**Consequence.** Settings gain one editable image-to-video model id. Existing profiles normalize with an empty override and therefore use the adapter default.

## E3 · Remix has one image-to-image operation

The selected-reference action is named **Remix**. Inside the panel, **New image** uses image-to-image, **New video** uses image-to-video, and **Upscale** remains under **Edit this reference**.

**Reason.** New image and Restyle sent the same request. Two labels must not promise two operations when the runtime cannot tell them apart.

**Consequence.** The first-release Restyle action becomes Remix → New image. Persisted media capability names do not change.

## E4 · Original provenance is read-only and last

Generated references show an **Original request** section at the end of the inspector. It projects the prompt, operation, and model from the item’s existing generation provenance.

The Librarian’s editable **Generation prompt** stays where it is and keeps its current meaning.

**Reason.** These prompts answer different questions. One records what made this file. The other describes how to make future work in the same language.

**Consequence.** No generation data is copied into the Librarian profile.

## E5 · Large pickers use the shared searchable Combobox

The source picker and facet menus use the searchable Combobox from `@sero-ai/ui`. Its result area has a fixed maximum height.

Facet menus use multi-select. Selection ticks appear on the right through the shared component.

**Reason.** A plain select or complete menu does not scale to thousands of values. A scroll area alone moves the problem into a long scroll.

**Consequence.** Users type to narrow large lists. Selection, keyboard control, filtering and focus behavior stay consistent with other Sero pickers.

## E6 · The generation choice uses grouped controls, not flat tabs

Fresh Generate uses a small option grid. Remix uses two labelled option groups:

- **Create new**
- **Edit this reference**

**Reason.** Tabs imply peer views. These controls select an operation and include an important source-versus-output distinction.

**Consequence.** The panel uses selectable controls that match the inspector’s border, spacing, focus, and selected-state language.

## E7 · Video protections apply to both video capabilities

Mandatory confirmation, duration limits, cost tracking, pending states, frame capture, playback, and Librarian analysis apply to text-to-video and image-to-video.

**Reason.** Source input does not change the spend or lifecycle risks of video generation.

**Consequence.** Shared video checks use an explicit video-capability predicate instead of one direct equality check.
