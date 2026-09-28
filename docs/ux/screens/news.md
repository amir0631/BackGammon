# News: announcement banners and the news list

Status: draft for UI build (CLAUDE.md §17 step 15, admin Content section; the client parts can ship with any later step).
Surface: `m.` (Phase 1). Same routes on `app.` in Phase 2 (§11.0 rule 7).
Sources: CLAUDE.md §1; §2 rules 8, 9; §10.2 (Content); §11.3; §11.5 (never during a match); §11.7; §13 (Content: announcements and banners, bilingual); §21.2 (no fake urgency); ia.md §1–§3; patterns.md (P§) 1 (banners), 4, 5, 9.2, 10, 11, 13, 15, 17; screen-inventory.md SY-07.
Related specs: `play.md`, `live.md`, `tournaments.md`, `shop.md` (tab roots that host the banner), `profile.md` (AC-01 hub row), `auth.md` (suspension banner order), `system.md` (offline banner, install banner), `admin-settings.md` (admin content editor, step 15).

Screen IDs: NW-01 (banner strip, formerly SY-07), NW-02 (news list), NW-03 (news item). This spec replaces SY-07 in system.md.

**API (implemented; field names are the contract):**

| Call | Response / notes |
| --- | --- |
| `GET announcements` | `{results: Announcement[], next: null}`: every item that is `active` and inside its optional `starts_at`/`ends_at` window, ordered by admin `sort`, then newest first. Readable without sign-in. No pagination. |
| `Announcement` | `id`, `kind` (`banner`: a strip on the lobby screens; `announcement`: listed in the news panel), `title` (`{fa, en}`), `body` (`{fa, en}`, plain text), `link` (an in-app path such as `/tournaments`, or `""`) |

Server rules the UI relies on (`backend/shop/models.py`, `backend/shop/views.py`, `backend/adminapi/content_views.py`):

- Admins create items with a bilingual title and body, a kind, an optional link, an optional schedule, and a sort order. Links are validated as paths (`^/[A-Za-z0-9_\-/?=&]*$`): no scheme, host, or dots.
- The API returns no dates, no image, and no link label (§10 Q1–Q3).
- There is no read or dismiss state on the server; the client keeps it on the device.

---

## 1. Goal and user story

- As a player, I want to notice important news (a new tournament, maintenance, a rule change) without it getting in the way of playing.
- As a player who dismissed a banner, I want to find it again later.
- As the operator, I want a simple bilingual channel that never looks like an ad or pressures anyone.

Success means:
- At most one banner is visible at a time, only on lobby-type screens, never in a match or a money flow.
- Every item is readable in the user's language, with a sensible fallback.
- News never uses countdowns, "limited offer" styling, or purchase prompts.

---

## 2. Entry points and exit points

| Entry | Lands on |
| --- | --- |
| Tab roots `/play`, `/live`, `/tournaments`, `/shop` | NW-01 banner at the top of the content (when an undismissed banner exists) |
| Account hub row "News" (profile.md AC-01, new row in the Support group) | NW-02 `/news` |
| NW-01 "Details" | NW-03 `/news/[id]` |
| Deep link `/news/[id]` | NW-03 |

| Exit | Destination |
| --- | --- |
| NW-01 or NW-03 link action ("Open") | The item's `link` path |
| NW-03 back | NW-02 (or the previous screen when opened from a banner) |

---

## 3. Flow

### 3.1 Fetch and cache

1. `GET announcements` on app start (after the shell renders, low priority), on returning to the app after 10 minutes, and when NW-02 opens. No polling while visible.
2. Cache the last response for offline reading (`common.lastUpdated`).
3. Local state on the device (`localStorage`, keyed by account id, or `guest`): `bg.news.dismissed` (banner ids closed) and `bg.news.seen` (item ids opened or shown in NW-02). Ids no longer returned by the API are pruned.

### 3.2 Language

1. Use `title[locale]` and `body[locale]`.
2. If the current locale's title is empty, use the other locale's title and body, rendered with that locale's `lang` and `dir` (so Persian text keeps RTL inside an en UI and vice versa).
3. If both titles are empty, skip the item.

### 3.3 Link safety

1. Accept `link` only if it starts with exactly one `/` and does not start with `//`. Otherwise treat it as empty (no action shown).
2. Open with in-app navigation (no new tab, no full reload). Routes that need sign-in follow the normal guard (`/login?next=`).
3. Links to money task flows (`/wallet/transfer`, `/wallet/withdraw`) and to `/shop/coins/result` are ignored (§10 Q4): news must not start a money movement.

### 3.4 Banner (NW-01)

1. Candidates: `kind = banner`, not dismissed. The first in server order is shown. After it's dismissed, the next one shows on the next navigation to a host screen (not immediately, to avoid a flicker of banners).
2. **Host screens:** tab roots only: `/play`, `/live`, `/tournaments`, `/shop`. Not on `/me`, children, auth, task flows, `/shop/coins/result`, system screens, the matchmaking overlay, or immersive screens (§11.5, P§15).
3. **Position:** at the top of the content, below the app bar and below any status banners, in this order: suspension (AU-13) → offline → tournament pre-start (tournaments.md) → announcement. It never covers content (it pushes it down) and never overlaps the resume banner (PL-08, which sits above the nav).
4. **Content:** megaphone icon (decorative), title (up to 2 lines, then ellipsis), and up to two text actions:
   - "Details" when `body` is not empty → NW-03.
   - "Open" when `link` is valid and `body` is empty → the link. (With a body, the link is offered inside NW-03 instead, so the banner stays small.)
   - Close (×), labeled "Dismiss announcement". Dismissing is permanent for that id on this device and account.
5. Showing a banner marks it as seen.
6. Guests (AU-01 welcome): not shown in Phase 1 (§10 Q5).

### 3.5 News list (NW-02)

1. `/news` lists **all** current items of both kinds (so a dismissed banner stays findable), in server order.
2. Row: title (2 lines max), first line of the body as secondary text (1 line), an "New" chip (icon + text) when the id isn't in `bg.news.seen`. No dates (§10 Q1).
3. Opening the list does not mark rows as seen; opening a row does, and the chip disappears when returning.
4. Row tap → NW-03.
5. Account hub row "News" shows "{n} new" as secondary text when unseen items exist (text only; no nav badge, ia.md §3.1 badge rules).

### 3.6 News item (NW-03)

1. `/news/[id]`: find the item in the cached or freshly loaded list. Not present (expired, deactivated, or unknown) → "This news item is no longer available." + "All news".
2. Content: title (h1), body as plain text: paragraphs split on blank lines, single line breaks kept; no HTML, no Markdown, and URLs in the body are not auto-linked (§10 Q2).
3. Link action (primary, full width, thumb zone at `sm`): "Open" (`news.open`; §10 Q3 for a custom label).
4. Marks the item as seen.

---

## 4. Screen list

### NW-01 Announcement banner (global strip on tab roots)

- `Banner` component, severity `info`, `role="status"` (not `alert`: news is not urgent). One at a time. Height grows with text; never more than 2 title lines.
- Actions: "Details" or "Open", and Dismiss (×), all ≥ 44 × 44.

### NW-02 News `/news` (Tab 5 child)

- App bar: back (mirrors), title "News", balance chip.
- Content: list rows (≥ 64 px) as §3.5; empty state.
- Primary action: none; rows are links.

### NW-03 News item `/news/[id]` (Tab 5 child)

- App bar: back, title "News", balance chip.
- Content: title, body, link action.

---

## 5. States

| State | NW-01 | NW-02 | NW-03 |
| --- | --- | --- | --- |
| **Loading** | Nothing shown until data arrives (no skeleton; the strip must not flash) | 4 skeleton rows | Title and body skeleton |
| **Empty** | Not rendered | "No news right now." (no action) | Not-available state |
| **Error** | Not rendered (silent; retried on the next trigger) | Screen error + Retry | Screen error + Retry |
| **Offline** | Cached banner may show; actions work for cached routes | Cached list with `common.lastUpdated` | Cached item; uncached → offline error state |
| **Reconnecting** | n/a (REST) | n/a | n/a |
| **Insufficient coins** | n/a | n/a | n/a |
| **Suspended** | Shown below the suspension banner | Works | Works; links to blocked actions land on screens that show their own suspended state |
| **Banned** | No session | ← | ← |
| **First-time user** | Shown normally; never at the same time as the first-visit hint of the same screen (the hint waits) | — | — |
| **In a match / money flow** | Never shown | n/a (not reachable from immersive screens) | n/a |

---

## 6. Responsive notes (§11.7)

| Breakpoint | NW-01 | NW-02 / NW-03 |
| --- | --- | --- |
| `xs` 320–359 | Full-width strip; actions wrap to a second row under the title | Single column |
| `sm` 360–599 (390 × 844) | Title and actions on one row when they fit; else wrap | Single column; NW-03 action sticky in the bottom 40% |
| `md` 600–1023 | Strip across the content column (not under the rail) | Tab 5 list-detail: NW-03 in the detail panel; URL follows |
| `lg` ≥ 1024 | Strip across the main column, max 1280 shell; not repeated in side panels | As `md` |

- **Landscape phones** (height < 500 px): the banner title is limited to 1 line with "Details" always offered, so it takes at most one row plus padding.
- Width and orientation changes keep dismiss and seen state.

---

## 7. RTL/LTR notes and i18n keys

- fa first. The strip, icons, and actions mirror. Fallback-language content gets its own `lang` and `dir` (§3.2), inside `<bdi>` where it sits within localized UI text.
- Admin content is shown as typed; the UI never translates it.

| Key | fa | en |
| --- | --- | --- |
| `news.title` | اخبار | News |
| `news.banner.details` | جزئیات | Details |
| `news.banner.open` | باز کردن | Open |
| `news.banner.dismiss` | بستن اطلاعیه | Dismiss announcement |
| `news.banner.label` | اطلاعیه: {title} | Announcement: {title} |
| `news.list.new` | جدید | New |
| `news.list.empty` | فعلاً خبری نیست. | No news right now. |
| `news.list.loadError` | اخبار بارگذاری نشد. | Couldn't load the news. |
| `news.list.rowLabel` | {title}{isNew, select, true {، جدید} other {}} | {title}{isNew, select, true {, new} other {}} |
| `news.item.open` | باز کردن | Open |
| `news.item.unavailable` | این خبر دیگر در دسترس نیست. | This news item is no longer available. |
| `news.item.allNews` | همه‌ی اخبار | All news |
| `news.hub.row` | اخبار | News |
| `news.hub.unseen` | {count, plural, one {# خبر جدید} other {# خبر جدید}} | {count, plural, one {# new} other {# new}} |

Shared keys used: `common.back`, `common.retry`, `common.lastUpdated`, `net.offline`, `errors.network`, `errors.generic`.

---

## 8. Accessibility

**Focus order**

| Screen | Order |
| --- | --- |
| Host screen with NW-01 | Suspension banner → offline banner → pre-start banner → NW-01 (title text, Details/Open, Dismiss) → the rest of the screen |
| NW-02 | Back → title → rows |
| NW-03 | Back → h1 → body → Open |

- After Dismiss, focus moves to the next focusable element in the content (not to the top of the page).
- NW-01 uses `role="status"` and is announced once when it first appears on a screen, not on every navigation.
- Labels: dismiss `news.banner.dismiss`; rows `news.list.rowLabel`; the "New" chip is icon + text.
- Contrast 4.5:1 on the banner's container color; the strip boundary 3:1.
- Motion: the banner appears without slide under reduced motion; no auto-rotation or carousel ever.
- Text 200%: the strip grows and wraps; actions stack; no truncation of the dismiss button.

---

## 9. Acceptance criteria

1. With an active `banner`, NW-01 shows on `/play`, `/live`, `/tournaments`, and `/shop` only, below the suspension, offline, and pre-start banners; never on immersive screens, task flows, the matchmaking overlay, or `/shop/coins/result`.
2. Only one banner shows at a time; dismissing it hides it permanently for that id on this device and account, and the next banner appears only on the next navigation.
3. A banner shows "Details" when the body is non-empty and "Open" when only a valid link exists.
4. `link` values that don't start with a single `/`, or that point to money task flows or the payment result, produce no action.
5. `/news` lists both kinds in server order, marks unseen items with "New" (icon + text), and a dismissed banner is still listed.
6. `/news/[id]` renders the body as plain text with paragraphs; unknown or expired ids show the not-available state with "All news".
7. When the current locale's title is empty, the other locale's text shows with correct `lang` and `dir`; items with no title in either locale are skipped.
8. The Account hub "News" row shows "{n} new" text when unseen items exist; no nav badge is added.
9. Every screen passes the six §11.7 viewports in fa and en, portrait and landscape; no horizontal scroll; no clipped text at 200%; targets ≥ 44 × 44 px.
10. Every string comes from an i18n key with fa and en.

---

## 10. Open questions and API gaps

1. **No dates.** Items have no `published_at` (or `starts_at`) in the public payload, so the list can't show "2 days ago" or order by date. Proposal: return `starts_at` (or `created_at`).
2. **Body format.** Plain text only in this spec. If admins need links or emphasis, agree on a minimal safe subset (e.g., paragraphs and in-app links only) and sanitize on the server.
3. **Link label.** "Open" is generic. Proposal: bilingual `link_label` (e.g., «مشاهده‌ی تورنمنت» / "See the tournament").
4. **Link restrictions.** The server allows any path. Should the admin form refuse money task-flow paths (`/wallet/transfer`, `/wallet/withdraw`) and the payment result, matching §3.3? Also note the regex permits `//x` (no dot, so not an external host in practice); the client rejects it anyway.
5. **Guests.** `GET announcements` is public. Should the welcome screen (AU-01) show banners (e.g., maintenance notices) to guests?
6. **Content rules for admins.** Announcements must follow P§9 (no countdown sales, no "last chance", no purchase pushes after losses). Proposal: a short guideline in the admin Content editor (admin-settings.md, step 15) and a preview in both languages before publishing.
7. **Maintenance and critical notices.** A banner is dismissible and `role="status"`. Is a separate non-dismissible "system notice" kind needed for maintenance windows? If so, it belongs in system.md with the offline banner.
8. **Images.** No image field; banners are text-only. Confirm (keeps pages light on 4G).
