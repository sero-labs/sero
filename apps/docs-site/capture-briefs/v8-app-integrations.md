# V8 app integrations capture briefs

Use a disposable profile and synthetic data for all captures. Capture the desktop at 1440 × 900. Do not show a user name, home path, token, private remote, private prompt, or real account.

## Replace `docs/assets/images/git-app.jpg`

- Documentation placement: `/guide/git-integration`.
- Sero navigation: open **Git** from the app sidebar.
- Application state: use a synthetic repository with one staged file, one unstaged file, three public sample commits, and no remote.
- Visible controls: branch rail, working tree, commit box, diff pane, and history.
- Output: `apps/docs-site/docs/assets/images/git-app.jpg`; crop to the Git app, but keep the Sero sidebar for context.
- Check: labels and enabled actions match `plugins/sero-git-plugin/ui`.

## Replace `docs/assets/images/research.jpg`

- Documentation placement: `/guide/web`.
- Sero navigation: open **Web** from the app sidebar.
- Application state: show the result of a synthetic search for public Rspress documentation. Show cited history with no account data.
- Visible controls: Web navigation, provider status, and the selected history result.
- Output: `apps/docs-site/docs/assets/images/research.jpg`; crop to the Web app and keep its title.
- Check: tabs match `plugins/sero-web-plugin/ui/WebApp.tsx`.

## Replace Remote Control images

- Documentation placement: `/guide/remote-control`.
- Sero navigation: open the command menu and select **Connect Device**.
- Browser and device state: pair a disposable profile, then open Sero Remote on a second trusted device in the same test tailnet. Use one synthetic workspace and session.
- Visible controls: for `remote-web-1.jpg`, show chat and workspace selection; for `remote-web-2.jpg`, show the Files panel with synthetic files.
- Output: `apps/docs-site/docs/assets/images/remote-web-1.jpg` and `apps/docs-site/docs/assets/images/remote-web-2.jpg`; use a 1440 × 900 browser viewport and crop out the browser profile.
- Check: pairing uses the current QR or **Login URL** flow and both images show the same disposable profile.

## Replace MCP images

- Route: `/guide/mcp`.
- State: configure one disabled local sample server with a harmless command and one remote sample server that uses a placeholder environment variable for authentication.
- Visible controls: use the list for `mcp.jpg`, the local server editor for `mcp-server.jpg`, and the manager/status view for `mcp-manager.jpg`.
- Output: replace the three files under `apps/docs-site/docs/assets/images/`; crop to the MCP app with its title visible.
- Check: fields and action labels match `plugins/sero-mcp-plugin/ui/components/servers/McpServerCrudPanel.tsx`; no real path, URL, header, or secret is visible.

## Replace Admin images

- Route: `/guide/settings-models-admin`.
- State: open a disposable profile that contains one synthetic agent, skill, prompt, and session. Use placeholder model and provider values.
- Visible controls: capture **Settings**, **Agents**, **Skills**, **Prompts**, and **Sessions** for their matching image files.
- Output: replace `admin-settings.jpg`, `admin-agents.jpg`, `admin-skills.jpg`, `prompt-management.jpg`, and `admin-sessions.jpg` under `apps/docs-site/docs/assets/images/`; crop to Admin and keep the section navigation.
- Check: navigation shows **Resources**, **Config**, and **System** with the current labels from `NavSidebar.tsx`. Confirm that no prompt, path, model account, or session belongs to a real profile.
