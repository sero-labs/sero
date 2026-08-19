# V4 Workspace and Recovery Capture Briefs

Keep all current media until approved replacements are available.

## Desktop shell overview

- **Documentation placement:** `/guide/workspace-and-chat`
- **Sero navigation:** Open **Explorer** from the sidebar.
- **Application state:** In a disposable profile, select a synthetic `sero-sample` workspace and a short agent session. Show the main sidebar, title bar, Explorer file tree, editor, global chat panel, and status bar. Do not show onboarding dialogs, private paths, account names, tokens, or remote URLs.
- **Viewport:** 1440 × 900 at 100% application zoom. Capture the full Sero window.
- **Replacement file:** `apps/docs-site/docs/assets/images/explorer-view.jpg`
- **Check:** Compare every visible shell label and region with `App.tsx`, the title bar, sidebar, chat panel, and status bar in the same build.

## Explorer workspace overview

- **Documentation placement:** `/guide/explorer-workspace`
- **Sero navigation:** Open **Explorer**, then select **Files**.
- **Application state:** Use the same synthetic workspace. Show a small public sample project with one text file open, two safe uncommitted changes in the Git view, and one terminal with non-sensitive output. Do not show home-directory paths, credentials, personal repository names, or LAN addresses.
- **Viewport:** 1440 × 900 at 100% application zoom. Include the Explorer activity bar, sidebar, editor, and terminal panel.
- **Replacement files:** `apps/docs-site/docs/assets/generated/img15.jpg` and `apps/docs-site/docs/assets/images/explorer.jpg`
- **Check:** Compare visible panel names and controls with `ActivityBar.tsx`, `ExplorerSidebar.tsx`, `ExplorerWorkspace.tsx`, and the current Git contribution.

## Theme selection and editor

Use the same synthetic custom preset in all four captures. Edit only the active preset because of confirmed bug #379. Do not show imported filenames or personal preset names.

- **`theme-select.jpg`:** On `/guide/themes`, open **Themes** and show the preset selection tab. Keep the synthetic custom preset selected. Show the full preset grid and the mode control. Do not open the editor.
- **`theme-editor.jpg`:** Open the editor for the active synthetic preset. Select **Colours**, set the mode control to **Light**, and keep the color-token list at the top.
- **`theme-editor-2.jpg`:** In the same editor, select **Typography**, set the mode control to **Dark**, and keep the typography controls at the top.
- **`theme-editor-3.jpg`:** Select **Layout**, keep the mode control on **Dark**, and scroll the layout controls to the bottom so the lower radius controls are visible.
- **Viewport:** 1440 × 900 at 100% application zoom. Crop each image to the complete dialog or editor sheet with enough shell context to identify Sero.
- **Replacement paths:** Save each file under `apps/docs-site/docs/assets/images/` with the filename specified above.
- **Check:** Compare labels with `ThemePanel.tsx` and the theme editor components. Confirm that the selected preset is the preset shown in the editor.
