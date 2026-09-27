# Personas

Status: draft for approval (CLAUDE.md §17 step 0)
Scope: Phase 1, mobile surface `m.` (serves all devices, §11.0, §11.7)

These are working personas built from the product brief and the market context. They are not based on field research yet. Check them against real usage data before Phase 2 (§17 step 19).

---

## P1 — Reza, the between-rides regular (primary)

| | |
| --- | --- |
| Age / place | 38, Karaj, commutes into Tehran |
| Work | Ride-hailing driver; plays while waiting for fares |
| Device | Mid-range Android (Redmi Note / Galaxy A-series, 4 GB RAM), Chrome, installed PWA |
| Network | Mobile 4G that drops in tunnels and traffic; often runs a VPN, so his IP changes mid-session |
| Language | fa, Persian digits, Jalali dates |
| Session | 5–15 minutes, one hand, phone upright, may be interrupted by a fare at any moment |
| Backgammon | Expert. Grew up playing traditional rules in cafés. Does not want the game explained. |

**Goals**
- Start a match in two or three taps and finish a 1- or 3-point match inside one wait.
- Play for small coin stakes at the 50 or 100 tier.
- Keep his rating going up.

**Frustrations and fears**
- Losing a match because the connection dropped for 20 seconds.
- Suspecting the dice are rigged.
- Small, fiddly controls he can't reach with his thumb.
- Hidden fees.

**Design implications**
- Show the reconnect grace countdown clearly and warn before a forfeit (patterns.md §6).
- Put roll, confirm, and undo in the bottom 40% of the screen, with targets of 44 px or more.
- The Play tab must support "same settings as last time" as an explicit choice that still opens the cost confirmation.
- Show the entry, the 10% platform fee, and the payout before every coin table.
- Explain fair dice (the seed and "verify dice" in replays) in plain words in Help.

---

## P2 — Maryam, the evening casual and spectator

| | |
| --- | --- |
| Age / place | 29, Isfahan |
| Work | Office administrator |
| Device | iPhone 11, Safari; installed the app with Add to Home Screen after a friend showed her |
| Network | Home Wi-Fi in the evening, 4G during the day |
| Language | fa |
| Session | 20–40 minutes in the evening, often on the couch, sometimes in landscape |
| Backgammon | Knows the rules, plays casually. Less confident against strangers for coins. |

**Goals**
- Practice against the bot without risking coins.
- Watch good players and make small predictions on live matches.
- Make her board look nice with a theme.

**Frustrations and fears**
- Exposing her phone number or identity to strangers.
- Pressure to spend.
- Confusing money mechanics she can't predict ("how much will I get back?").

**Design implications**
- Label bots clearly. Bot play is always free (unless `bot.entry_enabled`) and has no rating.
- Predictions show one plain sentence explaining the pool, both side totals, her stake, and an estimated payout labeled as an estimate.
- No pre-selected coin packages, stake amounts, or tiers.
- Profiles show only public data. The phone number never appears anywhere outside her own account settings.
- iOS PWA constraints:
  - Push notifications work only in the installed app.
  - Gateway redirects in standalone mode need testing (see journeys.md J3 and the open questions).

---

## P3 — Hamid, the competitive analyst

| | |
| --- | --- |
| Age / place | 47, Tehran |
| Work | Engineer; plays seriously and follows the leaderboard |
| Device | Desktop browser at work (1440 × 900), iPad at home (768 × 1024, both orientations), and an Android phone |
| Network | Stable broadband |
| Language | fa, sometimes en |
| Session | 30–90 minutes; plays 5- and 7-point matches and tournaments |
| Backgammon | Expert with the doubling cube. Cares about the Crawford rule, pip counts, and match equity. |

**Goals**
- Win tournaments and climb the ELO board.
- Review his own replays move by move.
- Verify that the dice are fair.

**Frustrations and fears**
- A phone UI stretched across a big screen.
- Not seeing move history.
- Tournament timing surprises (a match starting while he's away).

**Design implications**
- At the `md` and `lg` breakpoints, show extra panels (move history, pip count, spectators) instead of stretched content (§11.7).
- Keyboard shortcuts (Space, Enter, Ctrl+Z, D) must work on `m.` too.
- Tournament detail shows the start time in Jalali with a relative time ("in 2 h 10 min"). It also asks for push notification permission at the moment of registration, not on first launch.
- The replay viewer has step, speed, jump-to-game, and "verify dice" (§20.2).

---

## P4 — Karim, the Arabic-speaking budget player

| | |
| --- | --- |
| Age / place | 22, Ahvaz (Khuzestan) |
| Work | Student, part-time shop assistant |
| Device | Low-end Android (3 GB RAM, older GPU, WebGL2 barely supported), 320–360 px wide |
| Network | Limited mobile data package; slow 4G / 3G fallback |
| Language | ar UI, Arabic-Indic digits; reads Persian too |
| Session | Short sessions, many bot games, occasional low-tier tables |
| Backgammon | Good player, plays with friends |

**Goals**
- Play smoothly on a weak phone.
- Earn coins through wins and the daily bonus rather than buying.
- Invite friends with his referral link.

**Frustrations and fears**
- A large first download.
- Lag.
- Text cut off in narrow layouts.
- Apps that show Persian strings in the Arabic UI.

**Design implications**
- Suggest lite mode (never switch it on automatically) when the frame rate is low (§11.6).
- Show 3D loading progress with a size hint and a cancel option.
- The `xs` layout (320 px) must be fully specified. Nothing clips at 200% text size.
- The ar locale gets complete strings, Arabic-Indic digits, and Gregorian dates.
- The referral screen explains when commission starts (after the referee's first purchase, §7.4) in one sentence.

---

## Secondary audiences (no full persona)

| Audience | What changes for them |
| --- | --- |
| English speakers (diaspora, foreigners in Iran) | LTR mirror of every screen; Latin digits; Gregorian dates. Payments still require an Iranian bank card (Shaparak). |
| Tablet users | `md` layout: side rail plus one side panel. |
| Desktop browser users in Phase 1 | `lg` layout: centered 1280 px shell with two side panels in a match; hover and keyboard support. |

---

## Persona-to-feature priority

| Feature | P1 Reza | P2 Maryam | P3 Hamid | P4 Karim |
| --- | --- | --- | --- | --- |
| Quick coin table | High | Low | Med | Med |
| Bot play | Low | High | Low | High |
| Tournaments | Low | Low | High | Med |
| Spectate and predict | Med | High | Med | Low |
| Replay and verify dice | Med | Low | High | Low |
| Shop themes | Low | High | Med | Low |
| Buy coins | Med | Med | Med | Low |
| Referral | Low | Med | Low | High |
| Lite mode | Med | Low | Low | High |
