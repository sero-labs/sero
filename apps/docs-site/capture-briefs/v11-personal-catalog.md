# V11 personal integrations and catalog capture brief

No current image was removed or replaced in this slice. The four pages did not contain media references. Use these briefs only if screenshots are approved later.

## Starling Bank dashboard

- **Documentation placement:** `/plugins/starling`
- **Sero navigation:** Open **Starling Bank** from the app sidebar, then select **Overview**.
- **Task:** Show the four dashboard tabs without publishing bank data.
- **State:** Use a disposable profile and a mock API fixture. Show **Overview**, **Transactions**, **Savings**, and **Settings** with synthetic names, identifiers, balances, and transactions. Do not connect a real Starling account.
- **Viewport:** 1440 × 900 desktop viewport at 100% scale. Show the plugin header and full tab row.
- **Do not show:** A Personal Access Token, real account holder, account identifier, balance, transaction, local path, or notification.
- **Replacement file:** `apps/docs-site/docs/assets/plugins/starling-dashboard.webp`
- **Check:** Compare the visible labels with `ui/screens/Dashboard.tsx` and its tab components in the current owner repository.

## Weight Tracker history

- **Documentation placement:** `/plugins/weight-tracker`
- **Sero navigation:** Open **Weight Tracker** from the app sidebar.
- **Task:** Show how entries, the trend, and a goal appear together.
- **State:** Use a disposable profile. Add six synthetic `kg` entries over six weeks, a clearly fictional note, and a goal. Keep the remove controls visible for at least one entry.
- **Viewport:** 1440 × 900 desktop viewport at 100% scale. Show the app header, summary, trend, goal, and part of the entry list.
- **Do not show:** Real health data, names, dates of birth, local paths, sessions, or notifications.
- **Replacement file:** `apps/docs-site/docs/assets/plugins/weight-tracker-history.webp`
- **Check:** Compare the controls and values with `ui/WeightTracker.tsx` and `ui/EntryList.tsx` in the current owner repository.
