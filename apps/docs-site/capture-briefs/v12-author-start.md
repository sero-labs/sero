# V12 plugin-author start capture brief

Use a disposable profile and a copy of the maintained external Kanban starter. Use a
1440 × 900 desktop viewport. Do not show a user name, home path, token, private
repository, or unrelated plugin.

## Replace `docs/assets/images/local-plugin-preview.jpg`

- Documentation placement: `/reference/plugins`.
- Sero navigation: open **Admin → Plugins → Local Plugin Development**.
- State: open **Admin → Plugins → Local Plugin Development**. Start a session
  for a renamed copy of the Kanban starter. Show one **Active** session with its
  managed UI development server ready. Keep the attached-folders area visible
  only if it is part of the current screen.
- Visible controls: the **Local Plugin Development** heading, source-folder
  selector or path label, session status, and available stop or refresh
  actions. Do not expose the absolute source path.
- Output: `apps/docs-site/docs/assets/images/local-plugin-preview.jpg`. Crop to
  the Admin plugin panel, but keep enough Sero navigation to identify the
  screen.
- Check: labels match the current Admin plugin UI. Confirm that the session uses
  `scripts.dev`, the declared `devPort`, and the expected `sero_<id>` remote.
  Confirm that no second unmanaged server uses the port.
