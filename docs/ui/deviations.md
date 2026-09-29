# UI deviations from the UX specs

Open gaps between the built `m.` screens and the UX specs (`docs/ux/screens/*.md`), recorded for a
UX ruling (CLAUDE.md §21 step 2). Each row says what the spec asks for, what ships, and why. Remove a row
when the gap is built or the UX specialist accepts it in a review.

Source: UX review `docs/ux/reviews/phase1-screens-2026-09-30.md` (X-03 and related minors).

## Wide layouts (`md` / `lg`, CLAUDE.md §11.7)

| Screen | Spec | Shipped | Reason |
| --- | --- | --- | --- |
| LV-01 live list (live.md §6) | `md`: list plus a preview detail panel; `lg`: filters as a persistent start panel, list, preview end panel | Preview panel from 840 px wide; filters stay a sheet; at 768 × 1024 one list column (review LV-04) | The list-detail rework of the live list isn't built yet. Every row still opens the full spectator view. |
| LV-03 spectator view (live.md §6) | `lg` (≥ 1024 px): board plus two side panels | Two untabbed side panels from 1280 px; 900–1279 px keeps one tabbed end panel | Same rule as the player view (match ruling 4, review LV-01 fix): below 1280 px, two side panels leave too little width for the board. |
| SH-03 item detail (shop.md §6) | `md`/`lg`: the item opens in a detail panel next to the list (URL follows); `lg` adds a "Your items" context panel | The item is its own route (`/shop/items/[id]`), same content at every width | Not built yet. The screen is complete and reachable at every width. |
| TO-01 / TO-02 tournaments (tournaments.md §6) | `md`: TO-02 in a detail panel next to TO-01; `lg`: plus a context panel with up to five live matches of a running tournament | TO-02 is its own route; "Live matches of this tournament" is a link to `/live?tournament=<id>` | Not built yet. The live matches stay one tap away. |
| TO-03 bracket (tournaments.md §6) | Connector lines at `md`/`lg` (review TO-08) | Rounds side by side without connectors; winners marked with icon, bold, and text | Visual polish, not built yet. |
| Leaderboard (leaderboard.md §6, AC 8) | `md`/`lg`: a row opens the public profile in a detail panel; `lg` context column with the explainer | Row opens `/profile/[username]` as its own screen; the explainer stays above the list | Not built yet. The "How ratings work" link is removed until `/help/*` exists (review X-01). |
| PR-04 my predictions (predictions.md §6) | `md`/`lg`: the selected card's match summary in the detail panel | Single column in the account detail area; no summary panel | Not built yet. The empty context column was removed (review X-03), so wide screens show the list only. |

## Help links

| Screen | Spec | Shipped | Reason |
| --- | --- | --- | --- |
| SH-04, TO-02, TO-04, PR-01, PR-02, leaderboard, RF-01 | "?" links to `/help/<topic>` | No help links | No `/help/*` pages or help content exist yet, and no spec defines them. Same ruling as play P-07 and wallet deviation 1: omit the links until help ships (review X-01). The inline rule sentences already carry the explanations. |
