# Recording a demo with Sero's own recorder

Sero records its own window to a YouTube-ready MP4. Use this to capture the
flagship and zero-to-first-workflow demos by driving Sero yourself while it
records — reliable, full quality, no external screen-capture tool.

## Quick recipe

1. Open Sero and get the workspace / flow ready to the point just before the
   first thing you want on camera.
2. Open a terminal inside Sero and start recording the whole window:

   ```bash
   sero app record start --fps 15 --full-window
   ```

3. Drive the demo — type the prompt, watch the agent work, install the plugin,
   open the panel, generate the report. Take your time; you can slow down for
   the camera.
4. Stop and save **outside the repo**:

   ```bash
   sero app record stop --save ~/Movies/sero-demos/flagship.mp4
   ```

That's a finished MP4 (H.264, yuv420p) you can upload or edit.

## Options

- `--fps 15` — frame rate. 15 is smooth for UI motion; higher (up to 30) is
  smoother but the effective rate is capped by how fast the window captures
  (roughly 10–15 fps at a normal window size). Omit for the light 2 fps default.
- `--full-window` — capture the whole Sero window (chrome, sidebar, chat,
  panels). Without it, only the active app panel is captured.
- `--crf 18` — quality on `start` (lower = better/larger; default 23, use ~18
  for export quality).
- `--save <path>` on `stop` — where to write the MP4. Use a path **outside the
  repo** (e.g. `~/Movies/sero-demos/…`). Without `--save` it lands in the
  workspace's `sero-recordings/` folder.

## Quality notes

- **Resolution vs. framerate:** a smaller window captures faster, so it's
  smoother. A ~1280×800 window records at ~12 fps and scales cleanly to 1080p;
  a full-screen Retina window is sharper but drops to ~7 fps. For smooth demo
  footage, keep the window at a moderate size.
- **YouTube:** the output is already H.264/yuv420p. To force exactly 1080p, or
  to trim/join clips, run it through ffmpeg afterwards, e.g.:

  ```bash
  ffmpeg -i flagship.mp4 -vf scale=-2:1080 -c:v libx264 -crf 19 \
    -pix_fmt yuv420p -movflags +faststart flagship-1080p.mp4
  ```

## Captions

Add captions and voiceover in your editor of choice.

## Recording the flagship demo instead

The flagship plugin demo is automated. It drives Sero, burns in its captions,
and writes the finished MP4 by itself. Use
[restart-checklist.md](../restart-checklist.md) for that run. The helpers live
in `apps/desktop/e2e/helpers/demo.ts`.

Use the manual recipe above for any demo that has no automated script.
