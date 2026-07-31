# PR 1 evidence — the engine

Both images are the engine's own output for the test fixture in
`plugins/sero-design-library-plugin/pixel-engine/testing/fixtures.ts`: a 12×16
rigged character, packed as a sheet with one row for the base pose and one row
for a four-frame walk.

| File | What it shows |
|---|---|
| `walk-sheet-1x.png` | 59×37 — the real size the engine writes |
| `walk-sheet-8x.png` | 472×296 — the same sheet at 8×, readable |

Read the walk row left to right. The head, torso and whip hold the same pixels in
every frame because a frame is placements of parts, never a redrawing (decision
P4). The whip is its own part, so it stays on the belt instead of swinging with
the leg it would otherwise have been cut into (decision P5).

**The images were re-encoded for GitHub.** `png.ts` writes an uncompressed
*stored* deflate stream on purpose, so its bytes never depend on a platform
zlib. Those bytes are 559 KB for the 8× sheet; the same pixels through node's
zlib are 2 KB. That 265× gap is the receipt behind the PNG-size item on the
plan's watchlist — it does not matter at 1× (8.8 KB), and PR 5 measures a real
kept sprite before export ships.
