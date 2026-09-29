# UX review: Phase 1 screens built since the 2026-09-29 reviews — 2026-09-30

- **Specs:** `docs/ux/screens/{live,predictions,shop,tournaments,leaderboard,referral,news}.md`; CLAUDE.md §11.5 (PWA)
- **Builds:** `dd87eec` (live, shop, tournaments, leaderboard), `840f7fc` (API gaps), `7dc2b56` (predictions, referral, news, PWA), `e60ba12` (referral link); fixes `17214f1`, `55f578d`, `09141cd`, `fca0a95` for the re-review
- **Reviewer:** ux-specialist (§21 step 3)
- **Scope of this pass:** blocking and major issues in detail, minors one line each (requested for speed).

## Summary

| Screen | Blocking | Major | Verdict |
| --- | --- | --- | --- |
| Live list and spectator view (LV-01 … LV-07) | 0 | 2 | changes required |
| Predictions (PR-01 … PR-04) | 0 | 1 | changes required |
| Shop and coins (SH-01 … SH-05, CO-01 … CO-04) | 0 | 1 | changes required |
| Tournaments (TO-01 … TO-08) | 1 | 2 | changes required |
| Leaderboard (PL-09, LB-01) | 0 | 0 | changes required (cross-cutting only) |
| Referral (RF-01, RF-02) | 0 | 0 | changes required (cross-cutting only) |
| News (NW-01 … NW-03) | 0 | 0 | changes required (cross-cutting only: X-02) |
| PWA (§11.5) | 1 | 0 | changes required |
| Cross-cutting (all screens above) | 0 | 3 | changes required |
| Re-review: play | 0 open | 0 open | approved with minor issues |
| Re-review: match | 0 open | 1 open (M-13) | changes required |
| Re-review: wallet | 0 open | 0 open | approved with minor issues |

## Evidence and method

- **Code read in full:** `features/live/*`, `features/predictions/*`, `features/shop/*`, `features/tournaments/*`, `features/leaderboard/*`, `features/referral/*`, `features/news/*`, `components/pwa/*`, `app/sw.ts`, `app/manifest.webmanifest/route.ts`, `app/offline/*`, and the spectator branch of `features/match/MatchScreen.tsx`. Also the shared rules in `packages/api-client/src/rules/{live,predictions,shop,tournaments,leaderboard,news,referral,install}.ts`.
- **Re-review:** read the fix commits and spot-checked every earlier blocking and major issue in `PlaySheet.tsx`, `PlayLobbyScreen.tsx`, `LiveMatch.tsx`, `MatchOverlays.tsx`, `MatchScreen.tsx`, `parts.tsx`, `WalletHomeScreen.tsx`, `e2e/match.spec.ts`, and `packages/game3d/src/scene/layout.test.ts`.
- **i18n:** a script checked all 669 static `t("…")` calls in the new features, plus the dynamic key families (`predict.blocked.*`, `spectate.*.title/body`, `predict.mine.status.*`, `referral.status.*`). Every key exists in both `fa.json` and `en.json`.
- **Bundle:** `scripts/check-size.mjs` on the existing build. Every non-game route is under 250 kB.
- **Not done:** no browser walk, because no server was running on port 3000 or 8080. No screenshots exist for these screens (see X-02). The e2e suite was not run, as agreed. Findings marked "probable" come from reading the code and need a probe.

---

## Live list and spectator view (`live.md`)

**What works:**
- Filters live in the URL and are kept for the session.
- The in-place refresh never reorders rows under the finger ("New list available · Show").
- The spectator view has no game controls: `input={null}`, and no roll, confirm, undo, cube, or resign control exists.
- Join errors map to LV-06, and `player` switches to the player view.
- The grace countdown appears on the player's bar, with warnings at 30 s and 10 s announced once each, and "@x is back" when they return.
- Reactions use the free set only, have a 3 s cooldown, appear in a lane that never covers the board, and have a device-local "Show" switch.
- LV-07 has no replay link.

**LV-01 · major · LV-03 spectator view · 1440 × 900 (every width ≥ 900 px with aspect ≥ 1)**
- **What happens:** Every wide layout gets one end panel with four tabs (Prediction · Moves · Reactions · Info). At `lg` the prediction pool, the move history, and the reaction strip compete for one tab slot. The picker is never "always visible", and the start panel never appears. The player view does add its start panel from 1280 px (match ruling 4).
- **What should happen:** At `lg`, the board plus two side panels:
  - start panel: move history and the players' reactions log
  - end panel: spectator count, the reaction strip and picker, and the prediction pool
  
  (CLAUDE.md §11.7 `lg` row, which names exactly these panels; live.md §6.)
- **Fix:** In `SpectatorView.tsx`, add the player view's `WIDEST` breakpoint (≥ 1280 px). The start panel shows `MoveHistory` plus a players' reactions log. The end panel stacks the spectators section (count and reaction grid) and `PredictionPanel` without tabs. Keep the tabbed single panel for 900–1279 px.
- **Test:** At 1440 × 900 in fa and en, two `aside` regions are visible. The reaction buttons and the prediction panel (when a pool is open) are visible without selecting a tab.

**LV-02 · major (probable) · LV-07 match-ended card · 844 × 390, 932 × 430, and any viewport at 200% text**
- **What happens:**
  - `EndedCard` is absolutely positioned at the bottom of the board region, and `BoardStage`'s root has `overflow: hidden`.
  - With PR-03 inside (chip, signed amount, 2–3 lines of result text, the stake/paid line, and a link), the title, score, reason, and two buttons are taller than the 390 px board region in landscape, and taller than any board region at 200% text.
  - The card grows upward and the clipped top holds the focused heading and the result text. The card has no scroll.
- **What should happen:** The result, and the prediction outcome if any, are fully readable at every §11.7 viewport and at 200% text (WCAG 1.4.4, 1.4.10; live.md AC 22).
- **Fix:** Give the card `maxHeight: calc(100% - 16px)` and `overflowY: auto`. In landscape phones and in large-text mode, render LV-07 as a bottom sheet, or in the scrolling info column, instead of over the board.
- **Test:** At 844 × 390 and 390 × 844 with 200% text, after `match.ended` with a settled prediction, the heading's bounding box lies inside the visible card and the viewport. Both buttons can be reached by scrolling within the card.

**Minor:**
- **LV-03:** "Back" and "Leave" always `router.push("/live")`. Entries from TO-02, a bracket, or PR-04 don't return to where they came from (live.md §2). Use `router.back()` when there is history, and fall back to `/live`.
- **LV-04:** The preview panel starts at 840 px, so 768 × 1024 shows one list column about 700 px wide with no detail panel. See X-03.
- **LV-05:** At wide widths the `R` shortcut does nothing, because the reactions sheet is suppressed there. Focus the reactions tab instead.
- **LV-06:** Pull-to-refresh is not built. Refresh is an icon button at all sizes. Acceptable; update the spec.
- **LV-07:** For suspended users, "Predict" stays enabled and the reason appears only inside the panel. live.md §5 asks for the button to be disabled with the reason.

---

## Predictions (`predictions.md`, live.md §3.4–§3.9)

**What works:**
- Nothing is pre-selected. The side is locked only after an existing stake.
- The rule sentence uses the pool's `rake_pct`. The estimate uses integer math and shows the "below stake" and "zero" warnings, with an icon and text, in both PR-01 and PR-02.
- PR-02 shows stake, toman, balance, balance after, both totals, the rule, and the irreversibility note, with the amount and the player in the primary.
- One `Idempotency-Key` is kept for each confirmation, including across network errors.
- The insufficient sheet puts "Change stake" first and shows "Get coins" as text, and it never appears after a result.
- Blocked texts never mention fraud.
- Results use the winner and the side. Refund texts are correct.
- PR-04 groups stakes by match, shows net amounts, and never links to a replay.

**PR-01 · major · PR-01 open, pool closes · `xs`/`sm` sheet and `md`/`lg` tab**
- **What happens:**
  - `poolVisible` requires `poolOpen || flow.own`.
  - When `pool.update {open:false}` (or the opening `turn.rolled`) arrives while a viewer with no stake has PR-01 open, `poolVisible` becomes false. On phones the sheet closes by itself; on wide screens tab 0 disappears and the view jumps to "Moves".
  - `closedWhileEntering` is set but never rendered, because its container is gone. The typed stake vanishes with no explanation. Only a polite live-region message is sent, and only on `pool.update`, not on the opening roll.
- **What should happen:** The primary disables, and "Predictions closed at the first roll. Nothing was charged." is shown in place (live.md §3.5 step 7, AC 14; predictions.md §3.1 "hidden after a short notice").
- **Fix:** Keep PR-01 mounted while `flow.step === "panel"` or `flow.closedWhileEntering`: add `|| flow.step !== null` to `poolVisible`, and on wide screens keep tab 0 until the user leaves it. The existing closed branch then renders `predict.error.closed`. Hide the panel only after the user dismisses it.
- **Test:** Open PR-01 with no stake, type 50, then emit `turn.rolled {opening:true}`. The sheet (or tab) stays open, shows `predict.error.closed`, and has no enabled Continue. No `POST predictions` is sent.

**Minor:**
- **PR-02:** The estimate is not announced once after the stake settles for 1 s (predictions.md §8). Only the visual line updates.
- **PR-03:** "Check status" while the original request is still in flight calls `confirm()`, which returns immediately. It is harmless, but the button does nothing visible. Show `common.stillWorking` instead.
- **PR-04:** At `md`/`lg`, `DetailColumns` renders an empty `detail-context` column (no match summary panel). See X-03.

---

## Shop and coins (`shop.md`)

**What works:**
- Four segment routes.
- Exactly one state line per card, with icon and text.
- Cards never buy. The price action opens SH-03.
- SH-04 shows cost, toman, balance, balance after, and "can't be refunded", and sends `expected_price`, so a changed price is refused, not charged.
- Nothing is equipped after buying.
- Equip has no confirmation and its snackbar mentions the current match.
- The 3D preview is lazy, respects Save-Data and WebGL2, and buying still works without it.
- CO-02 shows the support content only, with no packages or disabled buy buttons.
- CO-01 has nothing selected and offers "Use {lower} / {higher}" as user actions.
- CO-04 polls for 60 s, never says "failed" before the server does, and offers no upsell.

**SH-01 · major · CO-03 coin purchase confirmation · all viewports**
- **What happens:** `CoinsPurchase.tsx` shows `balance ?? 0` and `(balance ?? 0) + coins`. With `GET wallet` not loaded or failed, CO-03 shows "Your balance 0 coins" and a wrong "Balance after", and "Pay … toman with bank card" stays enabled. This is the same defect as play P-01. Today it is hidden only because online purchase is off.
- **What should happen:** The real balance and balance after, or a visible loading or error state, before the user leaves for the bank (shop.md §3.5 step 3, AC 11; P§2.1).
- **Fix:** Reuse the P-01 pattern:
  - skeleton value rows while `wallet.summary` is null
  - primary disabled with a balance-unknown reason
  - Retry calling `wallet.refresh()` when the read failed

  Apply the same fix to `ShopInsufficientSheet` (`balance ?? 0`).
- **Test:** With `enabled: true` and `GET /wallet` answering 500, CO-03 contains no "0" balance row, and the primary is disabled with a visible reason.

**Minor:**
- **SH-02:** `ITEM_UNAVAILABLE` on buy shows an action error but doesn't switch SH-03 to the not-available state (§3.8).
- **SH-03:** "Check status" never resends with the same key when the item isn't owned yet (§3.3 step 2).
- **SH-04:** After a definitive refusal (`SHOP_PRICE_CHANGED`, `ITEM_NOT_FOR_SALE`) the same `Idempotency-Key` is reused for the next confirm. Confirm with the main agent that refusals aren't cached under the key; otherwise create a new key after a refusal.
- **SH-05:** `bg.coinsReturn` is always `/shop/coins`, so CO-04 "Done" never returns to the route that opened the coins page (§3.5 step 3), and never to `/wallet`.
- **SH-06:** The CO-04 title is an `h2` with no `h1` on the page.

---

## Tournaments (`tournaments.md`)

**What works:**
- The state-driven primary.
- TO-04 shows entry, toman, balance, balance after, prizes, and the refund and presence rules, with one key and "Check status".
- TO-05 has initial focus on "Stay registered" and states the refund.
- Refusals say "Nothing was charged".
- The insufficient sheet offers affordable tournaments first.
- Cancelled cards never show the admin's free text.
- The bracket shows one round at a time on phones and scrolls inside its own region at `lg`, and winners get icon, bold, and text.
- `match.found.tournament` and `join_deadline` are now used by TO-08.

**TO-01 · blocking · TO-08 "Your tournament match is ready" · spectator view and player match view, all viewports**
- **What happens:**
  - `TournamentReadyDialog` is mounted only inside `SignedInShell`. The spectator view (`SpectatorView`) and a running match (`LiveMatch`) are immersive, don't render it, and don't handle `match.found` themselves.
  - The spec's own between-rounds flow sends players to "Watch" the feeder match (§3.6 step 4). When that match ends, the player's next match is created while they are on the spectator screen. They see nothing, the join grace runs out, and they lose the round.
  - The same happens to a player still in a table match when the tournament starts (§3.6 step 2).
- **What should happen:**
  - A player is never set to lose without a visible warning with a countdown (CLAUDE.md UX non-negotiable).
  - TO-08 over the spectator view.
  - In a running match, a non-blocking notice "Your tournament match is ready. Join within {mm:ss}." with "Details" (tournaments.md §3.6 steps 1–2, AC 10).
- **Fix:**
  - Move the `match.found` subscription into an app-level provider (`AppProviders`), so it runs on every route.
  - Render TO-08 there for every screen except a running player match.
  - In `LiveMatch`, render the notice (status region plus an announcement at 30 s and 10 s), opening the TO-08 content in a sheet.
  - `SpectatorView` shows TO-08 as is. "Go to match" sends `spectate.leave` first.
- **Test:**
  - On `/match/{id}` as a spectator, emit `match.found` with `tournament` and `join_deadline`: an `alertdialog` titled `tournaments.ready.title` with a countdown and "Go to match" is visible.
  - During a player match, the same event shows a visible, announced notice with a countdown.

**TO-02 · major · TO-02 finished result · all viewports**
- **What happens:**
  - The result card is derived from bracket slots only (`personalResult`): champion, runner-up, or "Out in round {r}". `my_place` and `my_prize` from the API are ignored.
  - A 3rd- or 4th-place finisher who won 12.5% of the pool reads "Out in round 2" with no prize on TO-02, while their TO-01 card says "You placed 3rd · +125".
- **What should happen:** "You placed {place}" and "+{prize} coins won" whenever the API gives them (tournaments.md §3.7 steps 1–2; consistency, Nielsen 4).
- **Fix:** In `TournamentDetailScreen`, when `tour.my_place` is not null, render `tournaments.result.place` (or `won` for 1st) with `tournaments.result.prize` when `my_prize > 0`. Keep the slot derivation only as a fallback.
- **Test:** A finished tournament with `my_place: 3`, `my_prize: 125` shows "You placed 3rd" and "+125 coins won", and no "Out in round".

**TO-03 · major · TO-07 push explanation after the first registration · all viewports**
- **What happens:** Step 17 shipped Web Push (`NotificationsSetting`), but a successful registration doesn't open the explanation sheet. Opt-in exists only deep in Settings. Push is the main mitigation for the no-show forfeit (§10 Q2): a registered player outside the app gets no "your match is ready" alert.
- **What should happen:** Once, after the first successful registration, the TO-07 explanation sheet ("Allow" / "Not now") opens when push is supported and permission is `default` (tournaments.md §3.3 step 4; P§15).
- **Fix:** Extract the explanation sheet from `NotificationsSetting` and open it from `register()` on success, behind a per-account `localStorage` flag. Never open it when permission is `denied` or push is unsupported, or on iOS outside the installed app.
- **Test:** The first registration (permission `default`) shows the sheet. A second registration does not. "Not now" makes no permission request.

**Minor:**
- **TO-04:** TO-08's warning at 30 s or less uses color and font weight only. Add the warning icon (tournaments.md §3.6 step 1).
- **TO-05:** After "Not now", the resume banner has no join countdown (§3.6 step 1).
- **TO-06:** TO-08 opens immediately over an in-flight sheet or task flow (§3.6 step 1: wait for the in-flight request).
- **TO-07:** The pre-start banner shows during the matchmaking sheet on `/play` (§3.5 step 4).
- **TO-08:** The `lg` bracket has no connector lines (§6).
- **TO-09:** The detail and list have no `md`/`lg` list-detail or context panel. See X-03.

---

## Leaderboard (`leaderboard.md`)

The screen passes its own acceptance criteria by code:
- scope in the URL with replace
- the 60 s cache
- explainers with the minimum count
- signed gains with U+2212
- a medal shape plus the number
- the sticky my-rank row with scope-specific reasons
- null usernames aren't links

Open items are cross-cutting (X-01 `/help/rating`, X-03 AC 8).

**Minor:**
- **LB-01:** No pull-to-refresh (§3 step 6). The screen reloads only on visibility after 60 s.

---

## Referral (`referral.md`)

Passes by code:
- the link comes from the API (`e60ba12` builds it on the root domain)
- Share, with the fallback sheet
- the rules come from `pct`, `base`, and `days` (no hardcoded percent)
- the summary
- rows with status chips, where held and cancelled rows never show «+»
- no links to friends' matches

Open items are cross-cutting (X-01 `/help/referral`).

**Minor:**
- **RF-01:** Copy fails silently where `navigator.clipboard` is missing (http, older WebViews). Show `common.copyFailed` and select the link text.
- **RF-02:** The link box is focusable (`tabIndex=0`) but has no action. Make it non-focusable, or make it a selectable read-only field.

---

## News (`news.md`)

Passes by code:
- host screens only
- one banner at a time, with the next one after navigation
- safe links (blocking `//`, `\`, money flows, and the payment result)
- language fallback with `lang` and `dir`
- plain-text paragraphs
- "New" shown with icon and text
- the dismissed banner still listed

**Minor:**
- **NW-01:** An empty `detail-context` column at `md`/`lg`. See X-03.

---

## PWA (CLAUDE.md §11.5)

**What works:**
- The manifest exists only on `m.`, localized per locale cookie, with `standalone`, `portrait-primary`, and 192/512 plus maskable icons.
- The service worker precaches the build, including the 3D and Rapier chunks, and never intercepts `/api/` or `/ws`.
- There is an offline fallback page.
- The install banner shows on tab roots only (never in a match or money flow), follows the 7-day and max-3 rules, uses the Android prompt or the iOS guide, and never stacks with an announcement.
- "Install app" is in the Account hub. Push opt-in happens only after an explanation.

**PW-01 · blocking · SY-01 offline screen · all viewports**
- **What happens:** `/offline` offers "Try again" and "Home" only. `OfflineScreen.tsx` and the `7dc2b56` message defer "local bot play without a connection" to "a later step".
- **What should happen:** CLAUDE.md §11.5: "Offline: show a connection-lost screen; offer local bot play (no coins, no rating)." No agent can waive a CLAUDE.md rule.
- **Fix:** Either:
  - ship offline bot play: a client-side bot on `packages/game-core`, clearly labeled "Bot · offline · no coins, no rating", reachable from SY-01 and from PL-01 when offline; or
  - the main agent asks the user to defer this §11.5 item and records the decision in CLAUDE.md, as was done for M-01.
- **Test:** With the network offline, `/offline` shows "Play vs bot offline (no coins, no rating)", and a 1-point match can be completed with no network request.

**Minor:**
- **PW-02:** `skipWaiting` plus `clientsClaim` activates a new worker under an open session. Lazily loaded chunks from the old build (for example the 3D engine on the next match) can then fail with a chunk error until the page reloads. Consider a "New version, reload" prompt outside matches instead of immediate takeover.
- **PW-03:** `/offline` "Home" links to `/play`, which is also offline. Label it "Try the home screen", or hide it while offline.

---

## Cross-cutting

**X-01 · major · "?" help links · every coin-spend confirmation and several screens**
- **What happens:** No `/help/*` route exists. `CostConfirmation` renders its "?" help link from `helpHref` inside SH-04, TO-04, and PR-02. PR-01 (`/help/predictions`), TO-02 (`/help/variants`, `/help/tournaments`), the leaderboard (`/help/rating`), and RF-01 (`/help/referral`) also link there. Every one of these returns 404. A tap inside a coin confirmation leaves the sheet for an error page.
- **What should happen:** No link leads to a 404. This is the same ruling as play P-07, play deviation 2, and wallet deviation 1: omit links until `/help/*` ships.
- **Fix:** Until the help pages exist:
  - stop passing `helpHref` in `ItemScreen`, `TournamentDetailScreen`, and `PredictionSheets`
  - hide the "?" links listed above

  Keep the inline explanations, which already carry the rules.
- **Test:** Every `a[href]` on `/live`, `/match/{id}` (spectator with an open pool), `/shop/items/{id}`, `/tournaments/{id}`, `/leaderboard`, and `/me/referral`, including inside the open confirmation sheets, returns a status below 400.

**X-02 · major · evidence · all screens in this review**
- **What happens:** The builds add one e2e smoke spec per screen at 390 × 844 and no visual-regression screenshots. There is nothing at the six §11.7 viewports, in fa or en, or in landscape for LV, PR, SH, CO, TO, LB, RF, NW, or SY-01/SY-05.
- **What should happen:** Every screen and state has visual-regression screenshots at the §11.7 matrix, compared in CI (CLAUDE.md §16 Responsive; each spec's viewport AC). The same finding was M-13 and P-08.
- **Fix:** Add `toHaveScreenshot` suites with fixed clocks for every state in each spec's §5 table, at 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, 1440 × 900, 844 × 390, and 932 × 430, in fa and en. Add the 200% text and 44 px target checks.
- **Test:** CI fails on a visual diff for these routes.

**X-03 · major · `md`/`lg` layouts not built and not recorded as deviations**
- **What happens:**
  - The spec'd list-detail and context panels are missing:
    - LV-01 preview only from 840 px
    - SH-03 never opens in a panel, and there is no "Your items" context panel
    - TO-01 and TO-02 have no detail or context panel (live matches with "Watch")
    - leaderboard AC 8 (profile in a detail panel)
    - PR-04 has no summary panel
  - `/me/predictions` and `/news` render an empty `detail-context` column at wide widths.
  - The PR records none of this as a deviation (§21 step 2), so UX can't rule on it.
- **What should happen:** Wider screens get more panels, not a stretched or blank layout (CLAUDE.md §11.7; each spec's §6).
- **Fix:** Either build the panels, or list each gap as a deviation in the PR for a UX ruling. Remove the empty `detail-context` columns now.
- **Test:** At 1024 × 768 and 1440 × 900, no empty panel is rendered, and each listed screen matches its §6 row or its accepted deviation.

---

## Re-review of the 2026-09-29 issues

| Issue | Status | Evidence |
| --- | --- | --- |
| P-01 join confirmation with unknown balance | Fixed | `PlaySheet.tsx`: `play.join.balanceUnknown`, balance-error retry, primary disabled while `balance === null` |
| P-02 cost block under the sticky footer | Fixed (code) | `useCostConfirmationParts` returns `footerMode: "inline"`; PL-03 uses it. Not re-verified by screenshot (X-02). |
| P-03 bot entry without cost screen | Fixed | `55f578d` `bot_entry` in config and `BOT_ENTRY_CHANGED`; PL-04 cost block; MA-13b bot "Play again" routes to PL-04 when enabled |
| P-04 queue protocol in the app | Fixed | `17214f1` `QueueFlow` in `packages/api-client` with unit tests |
| P-05 lobby cramped at `md` | Fixed (code) | Side column `minmax(15rem, 17.5rem)`, `TierGrid` `minmax(min(13rem, 100%), 1fr)` |
| P-06 shop nudge after a loss | Fixed | `&from=loss` sets `afterLoss`; MA-13b waits while the balance is unknown |
| P-07 `/leaderboard` 404 | Fixed | The route now exists |
| M-01 board targets | Fixed | CLAUDE.md §11.1/§11.7 amended by the user (`09141cd`); `layout.test.ts` asserts checkers ≥ 32 px and hit area ≥ 44 × 32 |
| M-02 board at 200% text | Fixed (code), unverified | Board row `minmax(min(45svh, 100vw), 1fr)`, the rest scrolls, large-text bar mode, `keep-all` labels. Needs the 200% probe. |
| M-03 match rules in the app | Fixed | `17214f1` `game-core/rules.ts` with tests |
| M-04 replay and history links 404 | Fixed | `/replay/[id]` and `/me/matches` shipped in `fca0a95` |
| M-05 used-dice contrast | Fixed | `DiceChips` uses secondary text; pair added to `contrast.test.mjs` |
| M-06 landscape board width | Fixed (code) | Columns `min(12rem)` / `minmax(55vw, 1fr)` / `min(8.5rem)` |
| M-07 shortcuts over focused controls | Fixed | `LiveMatch.tsx` shortcut target guard excludes buttons, links, and ARIA widgets |
| M-08 Take/Drop unequal weight | Fixed | Both buttons `variant="outlined"` |
| M-09 disconnect warnings | Fixed | Announced once at 30 s and 10 s; one visual line |
| M-10 loader Cancel during download | Fixed | `cancelLoading` attaches at once, else returns to `/play` |
| M-11 unsupported-device resign copy | Fixed | Resign body with entry and payout; MA-14 after `match.ended` |
| M-12 "lost" words on a won match | Fixed | `match.result.debit` for the entry and fee rows |
| M-13 match visual regression | **Open** | `e2e/match.spec.ts` still calls `page.screenshot()` without comparison and without `page.clock.install` |
| W-21 wallet at 768 × 1024 | Fixed (code) | History column `minmax(18rem, 1.25fr)` |
| W-22 `/wallet/withdraw` JS budget | Fixed | 249.5 kB after `7dc2b56` (0.5 kB headroom); `build` now runs `check-size.mjs` |

The earlier minor issues (P-08 … P-11, M-14 … M-24, W-19, W-20, W-23, W-24) were not re-checked in this pass.

## Verdict

**Changes required.**
- **Blocking:** TO-01 (tournament match-ready never reaches players in immersive views) and PW-01 (offline bot play missing, CLAUDE.md §11.5).
- **Major:** LV-01, LV-02, PR-01, SH-01, TO-02, TO-03, X-01, X-02, and X-03, plus M-13 still open from the match review.
- **Re-review:** play and wallet are approved with minor issues.
