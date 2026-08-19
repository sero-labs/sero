# Google Plugin

Google adds Gmail and Google Calendar to Sero. It uses the `gog` command from [gogcli](https://github.com/steipete/gogcli).

## Set up Google

The current plugin depends on an externally managed macOS `gog` installation. It does not yet meet Sero's standard zero-manual-install toolchain contract.

Create a Desktop app OAuth client in Google Cloud Console. Enable the Gmail API and Google Calendar API. Open **Google**, enter the client ID and client secret, save them, and select **Sign in with Google**. Each Sero profile has a separate account context.

You can also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. OAuth credentials and tokens are sensitive. Do not include them in logs or screenshots.

## Use mail and calendars

Use the **Mail** and **Calendar** tabs, the Mail and Agenda widgets, or ask the agent. The plugin provides `google`, `gmail`, and `gcal` tools. It also registers `/gmail` and `/gcal`.

For direct terminal access, use commands such as:

```bash
sero google gmail search 'newer_than:1d'
sero google gmail thread <thread-id>
sero google calendar events primary --today
sero google calendar create primary --summary "Standup" --from 2026-08-12T09:00:00Z --to 2026-08-12T09:30:00Z
```

Send, create, and delete actions change Google data. Review recipients, dates, calendar IDs, and event IDs before you approve them.

The background runtime refreshes inbox state. In a container workspace, the plugin can fall back to the host when the container does not have `gog`.

## Recover access

If setup reports that OAuth is not configured, reopen Google and save the credentials. If `gog` is missing, the external host dependency is not available. Use `sero google auth status` to inspect authentication. Sign in again if the account is no longer valid.

App state is at `<SERO_HOME>/apps/google/state.json`. Do not delete this file as an OAuth recovery step.

## Related docs

- [Plugin Catalog](/plugins/catalog)
- [Security / Privacy](/reference/security-privacy)
