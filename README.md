# MAMAP Task Tracker

A graphical companion to the Kickoff/Daily/Weekly/Monthly/Quarterly task
tabs in `MAMAP_Personal_Tracker.xlsx` — same purpose, built as a web app
instead of a spreadsheet. Real shared data via Firebase Realtime Database,
same deploy pattern as the MAMAP onboarding app.

## 1. Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## 2. Deploy to GitHub Pages

Same process as the onboarding app:

1. Push this folder to a new GitHub repo.
2. **Settings → Pages → Source → GitHub Actions**.
3. Push to `main` (or **Run workflow** under the Actions tab).

The included workflow builds and deploys automatically. Your link:
`https://<your-username>.github.io/<your-repo-name>/`

If you hit the same snags as last time — files landing outside `src/`,
the workflow file needing the leading dot in `.github/workflows/`, or a
"multiple artifacts" error from re-running a partial run — the fixes are
identical to what worked before: create files with the exact typed path,
and use **Run workflow** for a clean run rather than re-running a failed one.

## 3. How tasks work

Every task lives in Firebase and syncs live across anyone with the link —
same **Live / Connecting… / Offline (local only)** indicator in the top bar
as the onboarding app.

**Kickoff** tasks are one-time — mirrors the 13 items from the Excel Kickoff
Checklist, tied to the WBS. Mark Done and they stay Done.

**Daily / Weekly / Monthly / Quarterly** tasks are recurring by default —
this is the main difference from the Excel version's Task Library + Log
split. A recurring task has one card, not a template plus a growing log
table: when you mark it Done, it's recorded (the card remembers "last done
X days ago"), and it automatically resets to Not Started with its due date
pushed forward by its interval (daily/weekly/monthly/quarterly). No manual
log row to add each time.

**Adding tasks**: the "+ Add task" button in the top nav works from any
view. Bucket, owner, due date, and whether it recurs are all set there —
picking a bucket auto-suggests the matching recurrence, but every field is
editable, so a one-off "Weekly" task or a recurring "Kickoff" reminder both
work if you actually need them.

**Calendar**: click any day to see what's due. Colored dots on each day
match the status colors used everywhere else (grey/amber/green/red).

**Editing**: click the pencil icon on a task card, or click a task directly
from the calendar's day panel.

## 4. Security note

Same as the onboarding app: the database is in open test-mode rules for
now — fine for a personal/demo tracker, worth tightening if this becomes a
real shared team tool.

## 5. Changelog

- **1.0.0** — Initial build: Dashboard (Kickoff progress, overdue/due-soon
  counts, tasks by bucket/status charts, upcoming list), Calendar (month
  grid with per-day task dots and a detail panel), five bucket views
  (Kickoff/Daily/Weekly/Monthly/Quarterly), Add/Edit task modal, and
  self-advancing recurring tasks. Connected to Firebase Realtime Database
  from the start. Seeded with the same task set as the Excel tracker.
