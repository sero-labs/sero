# V2 Platform Facts Capture Briefs

## Replace `docs/assets/generated/img8.jpg`

- **Route:** `/reference/state-and-folders`
- **Purpose:** Show the fixed registry root, the active profile root, and the active profile's agent directory without implying that every custom profile is inside `~/.sero-ui/`.
- **State:** Use a static diagram with a default profile and one custom profile. Show `~/.sero-ui/profiles.json` as fixed. Show the default profile root as `~/.sero-ui/` and its agent directory as `~/.sero-ui/agent/`. Show the custom profile as `<custom-profile>/` with `<custom-profile>/agent/`.
- **Visible content:** Include `agent/`, `apps/`, `workspaces/`, `themes/`, and `debug/` under each profile root. Include representative `agent/` files only when they remain legible.
- **Do not show:** A real user name, absolute custom path, credential value, token, workspace name, or `~/.pi/agent/` path.
- **Viewport and crop:** Export a 1680 × 945 image. Crop to the diagram with 48 px minimum outer padding. Keep all labels readable at the documentation content width.
- **Accuracy check:** Compare the result with `SERO_FIXED_ROOT`, `SERO_HOME`, and `SERO_AGENT_DIR` in `apps/desktop/electron/platform/env/index.ts`. Confirm that the diagram does not put every custom profile under `~/.sero-ui/`.

## Replace `docs/assets/images/remote-web-connect.png`

- **Route:** `/reference/security-privacy`
- **Purpose:** Show that **Connect Device** grants profile-wide workspace access and has an expiry, without publishing a usable login credential.
- **State:** Open **Connect Device** in a disposable profile with synthetic workspaces. Generate a pairing, then replace the QR region and login URL with clear `REDACTED` placeholders before publication. Keep **Profile access**, **Access expires**, **Copy Login URL**, and **Generate New Code** visible.
- **Visible content:** The complete dialog heading, profile access value, expiry row, and the text that explains profile-wide access.
- **Do not show:** A scannable QR code, usable login URL, gateway token, Tailscale address, personal profile name, real workspace name, local path, or session content.
- **Viewport and crop:** Capture the desktop at 1440 × 900. Crop tightly to the full dialog, with all edges and the close button visible. Export at 2× scale when needed for readable text.
- **Accuracy check:** Confirm the labels and scope against the current Connect Device renderer. Confirm that neither the QR code nor login URL can be recovered or used. Generate a new code after capture so the captured credential is invalid even in the source image.
