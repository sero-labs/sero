# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/7-architect-in-an-existing-workspace.html`.
Its two frames, its Decisions and its "Controls on this screen today" lists are
binding.

**Status: captured.** Both frames were put beside the built surface and read as
images. Frame 1 is the closed Existing workspace dialog; frame 2 is the same
dialog with the picker open. The New folder mode has no drawn frame and was
checked against the frame's own "Controls on this screen today" list.

## How the captures are taken

- `pnpm --filter @sero-ai/plugin-architect preview`, then screenshot the dialog at
  a viewport wider than the panel, so the harness page's own padding does not clip
  the panel's right edge.
- `?state=existing-workspace` opens the dialog on the Existing workspace choice
  and `?state=new-project` on New folder. A test-only `initialMode` prop picks the
  opening choice; the app always starts on New folder.
- TestRepo is chosen before the closed capture, and the picker is reopened for the
  open capture, so the chosen row is marked as the drawing marks it.
- The drawing's own `.dlg` is screenshotted from `file://` and read beside the
  build, frame by frame. Each surface was read as an image; a byte size proves
  nothing.
- Every fold was opened on the build: the Model overrides disclosure shows the
  three tier rows. The drawing keeps that fold closed, so it has no hidden content
  to compare.

## Two harness facts the captures needed

- **The harness now wraps the preview in `PluginStyleScope`.** The shared Select
  portals its menu into the plugin's `@scope` root, the same as the host does in
  `SeroAppMount.tsx`. Without it the menu portaled to `document.body`, left the
  scope, and lost every plugin style. This is harness chrome; no product code
  changed.
- **The picker menu is read as its own element.** This dev build generates the host
  tokens but not every Tailwind utility the shared popper uses, so the portaled
  menu lands wherever the dialog happens to sit. The menu was screenshotted on its
  own, with the dialog hidden, and the comparison sheet places it under the dialog
  the way the drawing does. The real host generates those utilities, so this is a
  harness limit, not a product fault.

## Differences the captures showed

| Frame | What the capture showed | What was done |
| --- | --- | --- |
| 1 | The build's dialog is a little wider (760px cap) than the drawing's 700px, and its Description field is about 220px tall where the drawing draws about 76px. | Left as shipped. Both come from the dialog's existing CSS and are unchanged by this issue, which the frame's "kept" list confirms. |
| 1, 2 | The drawn trigger shows the workspace name and path; so does the build, with the folder mark on the left and the chevron on the right. | Match. No change. |
| 2 | The build's menu rows put the name on the left and the path on the right, mark the chosen row, draw one rule before the workspaces a project cannot take, and show "Architect project" on the disabled rows. Global is absent. | Match. |
| 2 | The build marks the chosen row with the shared Select's check icon; the drawing only tints the row. | Kept. The check is the shared Select's own indicator and removing it would make this picker differ from every other picker in the app. A stated departure, not a removal. |
| 2 | The drawing wraps the longest path to a second line; the build's paths fit on one line at this width. | Left. The build keeps `word-break: break-all` and wraps when the menu is narrower. |
| — | No drawn frame for New folder. The build shows Name and Location and hides the picker, as the frame's "kept" list states. | Match. |
| — | The drawing's frames include the Architect top bar and a scrim; the harness renders the dialog alone. | Not compared. The top bar and scrim are unchanged by this issue and are drawn in the earlier audit frames. |

## Departures taken knowingly

- **New folder stays the default choice.** The drawing shows Existing workspace
  selected in both frames because that is what it is demonstrating. The cheaper
  default is the shipped behavior: a user who wants a new folder changes nothing.
- **The existing-folder refusal checks the folder the user named.** Frame 1's
  "Today" note names `Location / Name`. The host resolves the workspace destination
  from `slugify(name)`, so a name whose slug differs from the typed name is checked
  at the typed path, and an existing folder at the slug path could still be taken
  over. The common case, a name that is already kebab-case, is exact. Closing the
  rest needs a shared slug helper or a host destination query, which is wider than
  this issue.
- **A workspace whose path is unavailable is still offered.** The drawing has no
  frame for it. Creation proceeds and `git init` fails into the existing blocked
  state, which the project page already names.
