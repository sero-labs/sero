# V5 runtime and CLI capture briefs

## `docs/assets/generated/img1.jpg`

- **Purpose:** Support the architecture diagram with a current Sero shell overview.
- **Documentation placement:** `/reference/architecture`, beside **High-level model**.
- **Sero navigation and state:** In Sero, use a synthetic profile with one Host workspace and one agent session. Open Explorer and select the Host workspace.
- **Visible controls:** Show the workspace tree, active Explorer area, chat panel, and status bar. The selected workspace runtime must read **Host**.
- **Do not show:** Personal paths, private repository names, account data, tokens, provider keys, or session content from a real profile.
- **Viewport and crop:** Capture at 1440 × 900. Crop to the Sero window and keep all shell regions visible.
- **Replacement path:** `apps/docs-site/docs/assets/generated/img1.jpg`.
- **Check:** Compare visible labels with the current renderer and confirm that the image supports the adjacent architecture text.

## `docs/assets/images/explorer-view.jpg`

- **Purpose:** Show the shell regions described in **Shell model**.
- **Documentation placement:** `/reference/architecture`, beside **Shell model**.
- **Sero navigation and state:** In Sero, open Explorer in a synthetic workspace and open a synthetic agent session.
- **Visible controls:** Show the title bar, sidebar, Explorer, chat panel, status bar, and runtime indicator. Do not open menus or dialogs.
- **Do not show:** User names, personal paths, private code, credentials, or real chat history.
- **Viewport and crop:** Capture at 1440 × 900. Crop to the full Sero window with no desktop background.
- **Replacement path:** `apps/docs-site/docs/assets/images/explorer-view.jpg`.
- **Check:** Confirm each visible region exists in the current renderer and matches the labels in the adjacent text.

## `docs/assets/generated/img5.jpg`

- **Purpose:** Compare the Host, Apple Container, and Docker / Podman runtime choices.
- **Documentation placement:** `/reference/containers-host-mode`, beside **Runtime modes**.
- **Sero navigation and state:** On a supported Apple Silicon Mac, open a synthetic workspace in Sero. Open its runtime picker and select **Host**.
- **Visible controls:** Show **Host**, **Apple Container**, and **Docker / Podman**, with **Host** selected. Include enough workspace tree context to show that the choice is per workspace.
- **Do not show:** Personal paths, private repositories, credentials, LAN addresses, or unrelated runtime errors.
- **Viewport and crop:** Capture at 1440 × 900. Crop around the workspace tree and runtime picker, with enough shell context to identify Sero.
- **Replacement path:** `apps/docs-site/docs/assets/generated/img5.jpg`.
- **Check:** Compare all labels and descriptions with `RuntimePickerMenu.tsx` and confirm that all three choices are visible.
