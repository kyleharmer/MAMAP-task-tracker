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

**My Day** is the landing view — three sections (Overdue, Due Today, Coming
Up in the next 4 days) pulled from every bucket's real due dates. This is
meant to be the page you actually open each morning; everything else is
for planning and setup.

**Every task is pre-populated on first load** — nothing starts empty. All
32 tasks from the Excel tracker (13 Kickoff + 4 Daily + 5 Weekly + 6
Monthly + 4 Quarterly) are seeded with real cadence-based dates, not
arbitrary placeholders: Weekly tasks are spread Monday through Friday,
Monthly tasks across specific days of the month in workflow order (close
out last month's numbers early, plan ahead later), and Quarterly tasks
anchored to the program's own Feb/May/Aug/Nov cadence. The **Add task**
button is for anything new that comes up — everything from the original
plan is already there from the first load.

**Kickoff** tasks are one-time — mirrors the 13 items from the Excel Kickoff
Checklist, tied to the WBS. Mark Done and they stay Done.

**Daily / Weekly / Monthly / Quarterly** tasks are recurring by default —
this is the main difference from the Excel version's Task Library + Log
split. A recurring task has one card, not a template plus a growing log
table: when you mark it Done, it's recorded (the card remembers "last done
X days ago"), and it automatically resets to Not Started with its due date
pushed forward by its interval (daily/weekly/monthly/quarterly). No manual
log row to add each time. Each recurring task also carries a fixed
**anchor** (which weekday, day-of-month, or quarter-month it belongs to) —
that anchor never changes even as the visible due date advances, so the
Calendar can always show the correct recurrence pattern, not just wherever
the task currently happens to sit.

**Adding tasks**: the "+ Add task" button in the top nav works from any
view. Bucket, owner, due date, and whether it recurs are all set there —
picking a bucket auto-suggests the matching recurrence, but every field is
editable, so a one-off "Weekly" task or a recurring "Kickoff" reminder both
work if you actually need them.

**Calendar**: click any day to see what's due. Colored dots on each day
match the status colors used everywhere else (grey/amber/green/red). Lighter
grey dots mark projected future occurrences of Weekly/Monthly/Quarterly
tasks based on their cadence — a visual preview of the recurrence pattern,
not individually clickable (the actionable item is always the real,
current due date, shown as a full-color dot). Daily tasks aren't projected
since "due every day" doesn't add information as a dot.

**Editing**: click the pencil icon on a task card, or click a task directly
from the calendar's day panel.

## 4. Security note

Same as the onboarding app: the database is in open test-mode rules for
now — fine for a personal/demo tracker, worth tightening if this becomes a
real shared team tool.

## 5. Changelog

- **1.1.0** — Added **My Day** as the default landing view (Overdue / Due
  Today / Coming Up in the next 4 days). Rebuilt seed data so every task is
  pre-populated on a real cadence instead of arbitrary placeholder offsets:
  Weekly tasks spread Monday-Friday, Monthly tasks spread across specific
  days of the month in workflow order, Quarterly tasks anchored to the
  program's own Feb/May/Aug/Nov cadence. Each recurring task now carries a
  permanent `anchorDate` (separate from its advancing `dueDate`) so its
  cadence pattern stays fixed even as it's completed and rescheduled.
  Calendar now shows lighter projected dots for the full Weekly/Monthly/
  Quarterly recurrence pattern across the visible month, not just each
  task's single next occurrence (Daily excluded from projection — "due
  every day" isn't informative as a calendar dot, so it stays in My Day
  and the Daily bucket only).
- **1.0.0** — Initial build: Dashboard (Kickoff progress, overdue/due-soon
  counts, tasks by bucket/status charts, upcoming list), Calendar (month
  grid with per-day task dots and a detail panel), five bucket views
  (Kickoff/Daily/Weekly/Monthly/Quarterly), Add/Edit task modal, and
  self-advancing recurring tasks. Connected to Firebase Realtime Database
  from the start. Seeded with the same task set as the Excel tracker.
