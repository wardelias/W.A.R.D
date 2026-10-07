# Backlog

Ideas parked outside the current phase. Nothing here gets built unless it's asked for or scheduled into a phase.

## Deferred from Phase 1

- Google push channels + syncToken incremental sync (only worth it if sync on open plus the 15-min cron feels slow).
- Editing or moving events from your other calendars (non-W.A.R.D.) inside the app. Needs a broader write scope and its own confirm flow.
- Pausing a habit (sick days, exam weeks), shown honestly in its history.
- Offline write queue for the PWA.
- Data export (JSON) and an in-app account deletion flow.
- Splitting a repeatedly slipped task into subtasks.
- Recurring tasks.

## Noticed while building Phase 1

- Fix habit logs older than yesterday from the habit page (today and yesterday only for now).
- Automated accessibility audit (axe) in the E2E suite, on top of the keyboard-reachable controls and labels already in place.
- Nonce- or hash-based script CSP once Next.js supports it with Partial Prerendering (today: header CSP with inline scripts allowed, nothing third-party).
- Google OAuth verification, only if W.A.R.D. ever gets other users.
- A "pause" for the shutdown reminder on chosen days (e.g. Friday night), if the daily reminder turns out to be noise.

## Later (from the brief, don't build unless asked)

- Moodle deadline import.
- Course notes to flashcards.
- Proactive, context-aware nudges.
- Gmail summaries.
