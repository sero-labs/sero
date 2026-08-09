# Sero Growth Metrics Log

Weekly snapshots until the `github-star-dashboard` loop takes over (Phase 2), then loop-generated.
GitHub traffic/referrer data expires after 14 days — never skip a week.

| Date | Stars | Forks | Watchers | Release downloads | Unique visitors (14d) | Top referrers | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-06 | 16 | 2 | 0 | 1714 | 17 | github.com:8, sero-ai.dev:8, t.co:2 | 116 total views, 146 unique cloners (841 clones) over 14d. Clone spike 2026-06-30 (394). Downloads dominated by toolchains (863) and browser-pack (816) assets; app releases only 35. All traffic endpoints returned data. |

<details>
<summary>Raw traffic data — 2026-07-06 snapshot (14-day window 2026-06-22 to 2026-07-05)</summary>

Views (`traffic/views`):

```json
{"count":116,"uniques":17,"views":[{"timestamp":"2026-06-22T00:00:00Z","count":2,"uniques":2},{"timestamp":"2026-06-23T00:00:00Z","count":1,"uniques":1},{"timestamp":"2026-06-24T00:00:00Z","count":1,"uniques":1},{"timestamp":"2026-06-25T00:00:00Z","count":10,"uniques":6},{"timestamp":"2026-06-26T00:00:00Z","count":1,"uniques":1},{"timestamp":"2026-06-27T00:00:00Z","count":5,"uniques":2},{"timestamp":"2026-06-28T00:00:00Z","count":5,"uniques":1},{"timestamp":"2026-06-29T00:00:00Z","count":1,"uniques":1},{"timestamp":"2026-06-30T00:00:00Z","count":41,"uniques":1},{"timestamp":"2026-07-01T00:00:00Z","count":15,"uniques":2},{"timestamp":"2026-07-02T00:00:00Z","count":2,"uniques":2},{"timestamp":"2026-07-03T00:00:00Z","count":10,"uniques":1},{"timestamp":"2026-07-04T00:00:00Z","count":12,"uniques":2},{"timestamp":"2026-07-05T00:00:00Z","count":10,"uniques":2}]}
```

Clones (`traffic/clones`):

```json
{"count":841,"uniques":146,"clones":[{"timestamp":"2026-06-22T00:00:00Z","count":10,"uniques":7},{"timestamp":"2026-06-23T00:00:00Z","count":6,"uniques":3},{"timestamp":"2026-06-24T00:00:00Z","count":7,"uniques":4},{"timestamp":"2026-06-25T00:00:00Z","count":5,"uniques":2},{"timestamp":"2026-06-26T00:00:00Z","count":4,"uniques":1},{"timestamp":"2026-06-27T00:00:00Z","count":43,"uniques":15},{"timestamp":"2026-06-28T00:00:00Z","count":76,"uniques":16},{"timestamp":"2026-06-29T00:00:00Z","count":49,"uniques":16},{"timestamp":"2026-06-30T00:00:00Z","count":394,"uniques":33},{"timestamp":"2026-07-01T00:00:00Z","count":29,"uniques":14},{"timestamp":"2026-07-02T00:00:00Z","count":62,"uniques":17},{"timestamp":"2026-07-03T00:00:00Z","count":97,"uniques":31},{"timestamp":"2026-07-04T00:00:00Z","count":26,"uniques":10},{"timestamp":"2026-07-05T00:00:00Z","count":33,"uniques":10}]}
```

Referrers (`traffic/popular/referrers`):

```json
[{"referrer":"github.com","count":8,"uniques":6},{"referrer":"sero-ai.dev","count":8,"uniques":6},{"referrer":"t.co","count":2,"uniques":2},{"referrer":"sero-homepage.pages.dev","count":1,"uniques":1}]
```

Popular paths (`traffic/popular/paths`):

```json
[{"path":"/sero-labs/sero","title":"Overview","count":34,"uniques":15},{"path":"/sero-labs/sero/actions","title":"/actions","count":16,"uniques":1},{"path":"/sero-labs/sero/pulls","title":"/pulls","count":13,"uniques":1},{"path":"/sero-labs/sero/pull/224","title":"/pull/224","count":7,"uniques":1},{"path":"/sero-labs/sero/pull/227","title":"/pull/227","count":4,"uniques":1},{"path":"/sero-labs/sero/issues","title":"/issues","count":3,"uniques":1},{"path":"/sero-labs/sero/pull/226","title":"/pull/226","count":3,"uniques":1},{"path":"/sero-labs/sero/releases","title":"/releases","count":2,"uniques":2},{"path":"/sero-labs/sero/issues/174","title":"/issues/174","count":2,"uniques":1},{"path":"/sero-labs/sero/issues/214","title":"/issues/214","count":2,"uniques":1}]
```

Release downloads by tag: v0.4.0-beta.0: 26, v0.2.4-beta.0: 9, toolchains-2026-05-31: 863, browser-pack-2026-05-16: 816.

</details>

## Post-event deltas

Capture within 48h of every published post or launch.

| Date | Event | Star delta (48h) | Traffic delta | Notes |
| --- | --- | --- | --- | --- |
