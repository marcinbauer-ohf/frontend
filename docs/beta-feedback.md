# Send feedback

An in-app feedback form that only exists on beta and dev builds. It captures
where the user was when they opened it, shows them everything it captured, and
posts the report to a configurable endpoint.

## Gating

Everything is gated on `isBetaFeedbackEnabled()`
([`src/common/config/is_beta_version.ts`](../src/common/config/is_beta_version.ts)):
the sidebar item, the quick bar command, the `f` shortcut, the shortcuts-dialog
entry, the console error buffer, and the lazy dialog import. On a stable build
none of them render or register.

A build counts as beta when `hass.config.version` matches
`\d+\.\d+\.\d+(b\d+|\.dev\d*)` — for example `2026.9.0b3` or `2026.9.0.dev0`.

On a development build (`yarn dev`, i.e. anything built with `__DEV__` true) the
feature is always on, whatever core it is pointed at. Production builds fall
back to the version check below.

### Enabling it on a stable build for testing

```js
localStorage.beta_feedback_force = "1";
```

Then reload. Remove the key (or set it to anything else) to turn it off again.

The dialog is titled "Help us improve"; the sidebar and quick bar keep the
plainer "Send feedback", since a navigation label should say what it does.

## Entry points

| Entry point                       | Where                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar item "Send feedback"      | above Settings; not a panel, so it never appears in the sidebar edit list                                                         |
| Quick bar command "Send feedback" | command mode (`>`), and typing `feedback` matches it from any section                                                             |
| Keyboard shortcut `f`             | registered in [`src/state/quick-bar-mixin.ts`](../src/state/quick-bar-mixin.ts), respects the user's "keyboard shortcuts" setting |

The quick bar overlays the page, so it snapshots `location` and the open dialog
stack when it opens and passes that to the dialog as `origin`. The dialog
describes the page underneath, not the quick bar.

## What is captured

Collected by `collectFeedbackContext()`
([`src/data/beta_feedback_context.ts`](../src/data/beta_feedback_context.ts)).
Every item is listed in the dialog with a checkbox, so the user can drop any of
them before sending.

| Key                 | Contents                                                                             | Checked by default |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| `ha_version`        | `hass.config.version`                                                                | yes                |
| `frontend_version`  | `__VERSION__`                                                                        | yes                |
| `installation_type` | from `system_health/info`                                                            | yes                |
| `path`              | pathname, search, and a human label such as `Settings › Devices & services › Zigbee` | yes                |
| `panel`             | panel url path; for Lovelace also the dashboard, view, and whether edit mode is on   | yes                |
| `dialogs`           | open dialog tags; for `more-info` also the entity id, domain, and integration        | yes                |
| `integration`       | domain, when the page resolves to exactly one                                        | yes                |
| `browser`           | user agent, viewport, sidebar mode, Companion app flag, theme, dark mode, language   | yes                |
| `console_errors`    | last 20 `console.error` / `window.onerror` / `unhandledrejection` entries            | yes                |
| `core_log_excerpt`  | `system_log/list`, errors and warnings only, last 30, truncated to 8 KB              | **no**             |

The screenshot is **not** part of that checkbox list. It is a compact row at the
bottom of the same group, with an "Attach" button over a hidden file input (and
a red "Remove" once one is attached) and no image preview: the user attaches a screenshot they already took, which is
downscaled to 1280px wide JPEG q0.7 before it goes into the report. Nothing is
attached unless they add one.

No entity states or attribute values are ever captured — only entity ids,
domains, and integration names.

The log excerpt and the buffered console errors go through a redaction pass
(`redact()`) that replaces credentials, email addresses, IPv4/IPv6 addresses,
JWTs, and long hex blobs. The redaction is best-effort: it is a safety net on
top of the user reviewing the payload, not a substitute for it.

The switch rows are collected into `ha-grouped-list` frames rather than floating
loose: "Included with your report" holds the context toggle, the details row and
the analytics snapshot and the optional screenshot row; the consent switch sits
in its own frame below, after the optional contact field.
"Include context" is on by default and its supporting text is the one-line
summary. A "Preview" button sits to the left of its switch and opens
`dialog-beta-feedback-context` — a separate, closable dialog holding the
per-item checkboxes. Turning the switch off drops the whole
collected context from the report; an attached screenshot is a deliberate act
and still rides along.

A standing `ha-alert` in the main dialog, above the "Included with your report"
group, carries the privacy statement (`context.privacy_notice`) — it stays on
screen right up to the moment of sending, rather than disappearing the way a
toast would. Sending is blocked until the user turns on
the consent switch, which is marked required with an asterisk and sits last,
below the optional contact field.

## Report schema

```ts
interface BetaFeedbackReport {
  report_id: string; // "bf_" + 8 base32 chars, generated client-side
  created_at: string; // ISO 8601
  type: "bug" | "reaction"; // chosen first in the dialog
  product_area: string; // one of BETA_FEEDBACK_PRODUCT_AREAS, required
  message: string; // max 2000 chars
  contact?: string; // optional email
  context: Partial<FeedbackContext>; // only the items the user left checked
  analytics_snapshot?: Record<string, unknown>;
  schema_version: 1;
}
```

## Submission

`submitBetaFeedback()` POSTs the report as JSON to the endpoint from
`hass.config.beta_feedback_url` if core exposes one, otherwise to
`BETA_FEEDBACK_ENDPOINT` in
[`src/data/beta_feedback.ts`](../src/data/beta_feedback.ts). **That constant is
empty by default** — set it (or expose `beta_feedback_url`) before a beta, or
sending fails with "No beta feedback endpoint configured".

The transport sits behind `BetaFeedbackTransport`, so the target can be swapped
without touching the dialog. `setBetaFeedbackTransport()` replaces it (used by
the tests).

Failures are queued in `localStorage["beta_feedback_outbox"]` and retried the
next time the dialog opens; the dialog says how many reports are waiting.
Sending is rate limited to 10 reports per hour per browser, counted on attempt
so a broken endpoint cannot be used to bypass it.

### Google Apps Script receiver

Create a Google Sheet, then **Extensions → Apps Script**, paste this, and deploy
it as a web app with "Execute as: Me" and "Who has access: Anyone". Use the
resulting `/exec` URL as the endpoint.

```js
const SHEET_NAME = "reports";

function doPost(e) {
  const report = JSON.parse(e.postData.contents);
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "report_id",
      "created_at",
      "type",
      "product_area",
      "message",
      "contact",
      "ha_version",
      "path",
      "integration",
      "context",
      "analytics_snapshot",
    ]);
  }

  const context = report.context || {};
  sheet.appendRow([
    report.report_id,
    report.created_at,
    report.type,
    report.product_area || "",
    report.message,
    report.contact || "",
    context.ha_version || "",
    (context.path && context.path.label) || "",
    context.integration || "",
    JSON.stringify(context),
    report.analytics_snapshot ? JSON.stringify(report.analytics_snapshot) : "",
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, report_id: report.report_id })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

The frontend posts with `Content-Type: text/plain` so the browser sends a simple
request; Apps Script still receives the body in `e.postData.contents`.

## Updating the product area list

`BETA_FEEDBACK_PRODUCT_AREAS` in
[`src/data/beta_feedback.ts`](../src/data/beta_feedback.ts) drives the
"What is this about?" select. It is kept alphabetical with the catch-all last.
Edit the array at the start of each beta cycle:

```ts
export const BETA_FEEDBACK_PRODUCT_AREAS = [
  // alphabetical, with the catch-all last
  "Automations",
  "Dashboards",
  "Devices & services",
  "Energy",
  "Voice",
  "Something else",
] as const;
```

The values are the strings written to the sheet, so keep them stable within a
cycle. If you add an area that maps to a route or a dialog, also add a rule to
`PRODUCT_AREA_PATH_RULES` / `PRODUCT_AREA_DIALOG_RULES` in
[`src/data/beta_feedback_context.ts`](../src/data/beta_feedback_context.ts) so
the select is preselected for people already on that page.
`guessProductArea()` returns undefined when nothing matches, and the user picks
"Something else" or whatever fits. The field is required, so there is no
implicit default.

The label the user sees ("What is this about?") is deliberately plainer than the
field name on the wire (`product_area`), which stays as-is: it is the column
triagers read, not something a reporter ever sees.

These strings are deliberately **not** localized: they are internal triage
labels that release managers change per beta, and they are written verbatim to
the report.

## One-time analytics snapshot

The checkbox is off by default and sends nothing unless ticked. It calls the
`analytics/snapshot` websocket command, which **does not exist in core yet**.
Until it does, the call rejects, the user is told, and the report is sent
without a snapshot.

The expected core implementation lives beside `analytics/preferences` in
`homeassistant/components/analytics/http.py`: an admin-only command that builds
the same payload as `Analytics.send_analytics` at the `usage` level and returns
it without sending it and without changing preferences. The response shape the
frontend expects is `AnalyticsSnapshot` in
[`src/data/analytics.ts`](../src/data/analytics.ts).

## Copy as GitHub issue

The confirmation screen offers "Copy as GitHub issue": it copies a Markdown
version of the report (title, body, context table) to the clipboard and opens
the new-issue form for `home-assistant/core` when the context points at an
integration, or `home-assistant/frontend` otherwise. Nothing is ever posted to
GitHub automatically.
