# Design Handoff — Home Assistant Navigation Redesign Demo

## Your task

Create a visual demo of Home Assistant's new navigation system. The engineering work is complete in the frontend codebase; your job is to recreate it as a design demo (screens + key interaction states) that communicates the whole feature set. Build the following surfaces, in both desktop and mobile form factors, using Home Assistant's visual language (Lit/Material-derived, token-driven, light theme unless asked otherwise).

The demo should cover **five surfaces**:

1. Desktop floating **search pill**
2. Mobile **bottom navigation bar** with bottom sheets (Home, Search, Assist, More)
3. Rewritten **collapsible sidebar** (icon rail ↔ expanded) with **inline edit mode**
4. **Add link** dialog
5. Settings dashboard **profile/notifications card**

---

## Design tokens (use these as your variable set)

| Token                                 | Value / meaning                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `--ha-view-max-width`                 | `1400px` — max content lane width, shared by app bar, tabs, and search pill                        |
| `--ha-bottom-navigation-height`       | `64px`                                                                                             |
| `--ha-sidebar-width` (collapsed rail) | `80px` (was 56px)                                                                                  |
| `--ha-sidebar-expanded-width`         | `256px`                                                                                            |
| `--ha-sidebar-expanded-item-width`    | `240px`                                                                                            |
| `--header-height`                     | standard HA header height (56px desktop)                                                           |
| Selected-state tint                   | `color-mix(in srgb, var(--sidebar-selected-icon-color, var(--primary-color)) 15%, transparent)`    |
| Scrim                                 | `rgba(0, 0, 0, 0.32)`                                                                              |
| Badge                                 | bg `--accent-color`, text `--text-accent-color`                                                    |
| Sheet radius                          | `--ha-border-radius-2xl` on top corners only                                                       |
| Pill radius                           | `999px` (`--ha-border-radius-pill` / `--ha-border-radius-6xl`)                                     |
| Sidebar item radius                   | `--ha-border-radius-xl`                                                                            |
| Icon color (rest)                     | `--sidebar-icon-color` (falls back to `--secondary-text-color`)                                    |
| Text color                            | `--sidebar-text-color` (falls back to `--primary-text-color`)                                      |
| Surfaces                              | `--card-background-color`; sidebar/bottom-nav use `--sidebar-background-color` fallback to card bg |
| Dividers                              | `1px solid var(--divider-color)`                                                                   |

Animation: standard duration ~250–300ms ease; sheet slide-in is exactly **300ms**. Reduced-motion collapses all transitions.

---

## 1. Desktop — floating search pill

Replaces the old toolbar search and Assist icons (those are gone from the dashboard toolbar).

**Geometry:** fixed at top of viewport, floating over the dashboard's app bar. Height **40px**, max-width **480px** (shrinks to content-lane width − 64px on narrow desktops). Horizontally centered over the content area _to the right of the sidebar_ (center of `sidebar-width + content-width/2`), vertically centered within the 56px header. Position animates when sidebar expands/collapses.

**Anatomy (left → right):**

- Search icon (magnify, 20px, `--secondary-text-color`), 8px gap
- Placeholder text: **"Search, navigate, or ask"** — regular body size, secondary text color, start-aligned
- Assist icon button (comment-processing-outline) at right, inside 8px right padding — only when the Assist/conversation feature is available

**Style:** full pill radius, background `--secondary-background-color`, no border, no shadow. Cursor pointer over text area.

**Interactions to depict:**

- Click pill → opens **Quick bar dialog** (the existing quick-bar search dialog, min-height 620px, centered, content padding 0; keyboard-shortcut hint tip at the bottom, hidden under 450px width)
- Click Assist icon → opens voice Assist dialog

**Toolbar consequence to show:** the dashboard toolbar is capped and centered to the content lane (`--ha-view-content-width`, up to 1400px). When a dashboard has multiple tab views on desktop, the **view tabs move to their own second row below the toolbar** (so they don't collide with the pill), and the toolbar row shows the dashboard title instead. The toolbar/tab-bar width live-syncs to the actual rendered card columns.

---

## 2. Mobile — bottom navigation bar

Shown only on narrow/mobile viewports (replaces reliance on the hamburger drawer for primary nav; the menu button now only appears for external-app sidebar cases).

**Bar:** fixed to bottom, full width, height **64px** + bottom safe-area padding. Background = sidebar background (card surface), **1px top divider**. Five equal-width tabs. Page content and FABs lift 64px to sit above it.

**Tabs (left → right):**

| Tab      | Icon                             | Label                                |
| -------- | -------------------------------- | ------------------------------------ |
| Home     | `mdi:home`                       | "Home"                               |
| Search   | `mdi:magnify`                    | "Search"                             |
| Assist   | `mdi:comment-processing-outline` | "Assist" _(only if voice available)_ |
| Settings | **user avatar badge, 24×24**     | "Settings"                           |
| More     | `mdi:apps`                       | "More"                               |

**Tab anatomy:** vertical stack, 2px gap. Icon sits inside an **indicator pill 56×32px** (full pill radius). Label: XS font size, medium weight, single line ellipsis.

**States:** rest = icon `--sidebar-icon-color`, label primary text. Active = icon and label in `--primary-color`, indicator pill filled with the 15% primary tint. Home is active on any dashboard; Settings is active on `/config` and `/profile`.

**Bottom sheets** — tapping Home/Search/Assist/More slides a sheet up from behind the bar (Settings navigates directly to `/config`):

- Slides up `translateY(100%) → 0` in 300ms; scrim fades in above the bar
- Top corners rounded 2xl; **drag handle** centered at top: 40×4px rounded bar in divider color
- Home sheet = content height; Search/Assist/More = full height (viewport − bar − safe areas, min 48px top gap)
- Dismiss: tap scrim, tap same tab again, swipe down (sheet follows finger; releases closed on a downward fling or past 50% drag), or ESC
- Tapping a different tab swaps sheet content in place

**Sheet contents:**

- **Home** → "Dashboards" list: rows with pill radius, 48px min height, icon + label; selected dashboard row gets the 15% primary tint with primary-colored icon/label
- **Search** → the full quick-bar search UI embedded (search field, sectioned results: navigation / commands / entities, entity rows with state badges)
- **Assist** → header row "Assist" (large/medium-weight title) + pipeline dropdown button (chevron-down, small neutral button; preferred pipeline starred in menu; admin sees divider + "Manage assistants" link), then the assist chat conversation below; spinner while loading
- **More** → list of all remaining panels/pages (same row style as Home sheet)

---

## 3. Desktop sidebar — icon rail ↔ expanded

The sidebar is now collapsible with two persistent states. **Icon centers stay 40px from the left edge in both states — items grow to the right; no icon jump on toggle.** Width animates ~250ms.

**Collapsed (80px rail):** 48×48px icon-only items, radius XL, centered column, 4px vertical gap. Tooltips appear to the right on hover (instant). Header shows the **HA logo (32px) that cross-fades to a chevron-double-right icon on hover** — clicking expands.

**Expanded (256px):** items become 240px wide rows (icon + label), 8px side margins. Header: logo + bold "Home Assistant" title (title fades/slides in with slight delay) + chevron-double-left collapse button. Header row has bottom divider, height = header height.

**Selected item:** 15% primary tint background, primary-colored icon + label.

**Bottom user/settings row:** user avatar (32×32) + label ("Settings" for admins, else user name). Notification/update-count **badge**: accent-colored. Collapsed → small badge overlaid on the avatar's top-right; expanded → inline badge at row end. Badge cross-fades between positions on toggle.

**Edit mode (inline — the old "Edit sidebar" dialog is deleted):**

- Entered by **press-and-hold** on the sidebar header or any item (500ms), or via Profile → "Manage" button
- Items **jiggle** (±1–1.5° alternating rotation, infinite; off under reduced-motion) and become drag-to-reorder
- Each item gains a 1px divider-color border and an **× hide button** (except the default panel)
- Below a spacer: **hidden panels** section at 60% opacity, each with a **+ show button**; then (admins) an **"available pages"** section — suggested shortcuts like Devices, Automations, Areas, People, Tags, Voice assistants, Energy — each with **+ add**
- **Footer** (top divider): "Add link" row with + icon, and a full-width **"Done"** button

**Show these edit-mode states in the demo:** normal → jiggling reorder → hidden/available sections → footer.

---

## 4. "Add link" dialog

Standard HA dialog, min-width 400px (full-width under 450px). Title **"Add link"**. Content, 16px gaps, top to bottom:

1. Navigation path picker — label **"Path"** (allows custom values)
2. Icon picker — label **"Icon"**
3. Text input — label **"Name"**

Icon and name auto-fill when a path is chosen. Footer: **Cancel** (plain) + **Add** (disabled until path and name are filled).

---

## 5. Settings dashboard card

At the top of Settings (`/config`), a new outlined card with two rows (the old search icon and overflow menu in the Settings toolbar are removed):

1. **Profile row:** avatar 40×40 + user name + supporting text "Profile" + chevron-right → links to `/profile`; 56px min row height
2. **Notifications row:** bell icon (sidebar icon color) + "Notifications" + count **badge** (min-width 20px, 2px/6px padding, pill radius, accent bg, small font)

---

## Copy (exact strings)

| Context                      | String                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search pill placeholder      | Search, navigate, or ask                                                                                                                                                           |
| Bottom nav labels            | Home · Search · Assist · Settings · More                                                                                                                                           |
| Home sheet title             | Dashboards                                                                                                                                                                         |
| Sidebar expand/collapse a11y | Expand sidebar / Collapse sidebar                                                                                                                                                  |
| Edit mode actions            | Hide panel / Show panel / Add link / Done                                                                                                                                          |
| Add-link dialog fields       | Path / Icon / Name                                                                                                                                                                 |
| Profile section              | header **"Manage sidebar"**, description **"Change the order, hide items, or add shortcuts. You can also press and hold the sidebar to activate edit mode."**, button **"Manage"** |
| Settings card rows           | Profile / Notifications                                                                                                                                                            |

Use sentence case everywhere (HA style).

---

## Suggested demo structure

1. **Desktop dashboard** — collapsed 80px rail + floating search pill over a sections dashboard; second variant with the two-row toolbar (title row + tabs row)
2. **Desktop, sidebar expanded** — pill repositioned, expanded items, selected state, user row with badge
3. **Desktop, sidebar edit mode** — jiggle, hide buttons, hidden + available sections, Add link + Done footer
4. **Add link dialog** — empty and filled states
5. **Mobile dashboard** — bottom nav with Home active
6. **Mobile sheets** — one frame each: Home (dashboards), Search (quick bar), Assist (chat + pipeline picker), More (all panels); show scrim + drag handle
7. **Settings page (mobile or desktop)** — new profile/notifications card, Settings tab active in bottom nav
8. Optional: reduced-size flow diagram connecting pill → quick bar, bottom nav → sheets, long-press → edit mode

## Constraints

- Mobile-first, RTL-safe (chevrons and start/end paddings flip; icon rail measurement is from the start edge)
- All colors via the token table — no hardcoded hex except the scrim
- Respect reduced motion: note it, don't design separate frames
- Assist tab/button is conditional — fine to show it present in all frames, but note the condition
