# Signal Desk Plugin

Signal Desk collects RSS and Atom feeds, groups related items into stories, and keeps briefings, insights, and follow-up actions.

## Start with demo data

Open **Signal Desk** and select **Seed demo**. Refresh the demo sources, open a story, and create a briefing. This test uses public sample sources and does not expose private feed URLs.

When you add your own source, Signal Desk requests its URL over the network. Feed operators can see the request. Feed content can also contain untrusted text, so check source links before you act on a briefing.

The `signal_desk` tool can manage sources and watchlists, refresh feeds, list articles and clusters, create briefings, save insights, and manage follow-up actions. `/open-signal-desk-briefing` opens the briefing workflow in chat.

## Refresh and scheduling

A manual **Refresh** fetches enabled sources and updates local articles and clusters. You can set the refresh interval to five minutes or more, but the interval does not fetch feeds. Use **Refresh** when you need current data.

If Sero restarts during a refresh, the runtime marks that run as an error with a recovery message. Start a new manual refresh.

## Storage and recovery

Signal Desk is workspace-scoped at `<workspace>/.sero/apps/signal-desk/state.json`. This file contains source URLs, watchlists, article metadata, saved briefings, insights, and actions. Removing a source does not remove the original content from its publisher.

If the state file has malformed JSON, write actions stop instead of replacing it. Restore or repair the file before you make more changes. Remove private feed URLs, customer names, and internal topics from support reports.

## Related docs

- [Research Plugin](/plugins/research)
- [Plugin Catalog](/plugins/catalog)
- [Security / Privacy](/reference/security-privacy)
