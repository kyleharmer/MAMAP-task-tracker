import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import {
  LayoutDashboard, Calendar as CalendarIcon, Plus, X, Trash2, Pencil,
  ChevronLeft, ChevronRight, Repeat, Clock, AlertTriangle, CheckCircle2, Sun,
} from "lucide-react";
import { ref as dbRef, onValue, set as dbSet, remove as dbRemove, get as dbGet } from "firebase/database";
import { db } from "./firebase.js";

// ---------------------------------------------------------------------------
// Design tokens — same system as the MAMAP onboarding app
// ---------------------------------------------------------------------------
const COLORS = {
  gold: "#FABE3F",
  goldSoft: "#FDE7B8",
  ink: "#0A0A0B",
  paper: "#FFFFFF",
  stone: "#F6F5F2",
  line: "#E4E2DD",
  slate: "#55565B",
  slateLight: "#8B8C90",
  good: "#3E7D5B",
  goodBg: "#E9F3ED",
  warn: "#B5651D",
  warnBg: "#FBEEE2",
  bad: "#A23E3E",
  badBg: "#F6E9E9",
  info: "#1D5C8C",
  infoBg: "#E6EFF6",
};

const APP_VERSION = "1.1.0";

const BUCKETS = ["Kickoff", "Daily", "Weekly", "Monthly", "Quarterly"];
const STATUSES = ["Not Started", "In Progress", "Done", "Blocked"];
const OWNERS = [
  "Grant Program Manager", "VP, Operations", "Marketing Manager",
  "Data / CRM Analyst", "Grants Accountant", "Vetting Committee",
  "Subrecipients", "MIA (Funder)",
];
const INTERVALS = ["daily", "weekly", "monthly", "quarterly"];

const STATUS_META = {
  "Not Started": { color: COLORS.slate, bg: "#EFEFEE" },
  "In Progress": { color: COLORS.warn, bg: COLORS.warnBg },
  "Done": { color: COLORS.good, bg: COLORS.goodBg },
  "Blocked": { color: COLORS.bad, bg: COLORS.badBg },
};

const BUCKET_DEFAULT_INTERVAL = { Kickoff: null, Daily: "daily", Weekly: "weekly", Monthly: "monthly", Quarterly: "quarterly" };

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function addInterval(date, interval, sign = 1) {
  const d = new Date(date);
  if (interval === "daily") d.setDate(d.getDate() + 1 * sign);
  else if (interval === "weekly") d.setDate(d.getDate() + 7 * sign);
  else if (interval === "monthly") d.setMonth(d.getMonth() + 1 * sign);
  else if (interval === "quarterly") d.setMonth(d.getMonth() + 3 * sign);
  return d.getTime();
}
// All occurrences a Weekly/Monthly/Quarterly recurring task would land on
// within a given month, based on its stable anchorDate (day-of-week for
// weekly, day-of-month for monthly/quarterly). Daily and Kickoff are
// excluded — "due every day" adds no information as a calendar dot, and
// Kickoff is one-time already.
function occurrencesInMonth(task, year, month) {
  if (!task.recurring || !task.interval || task.bucket === "Daily" || task.bucket === "Kickoff") return [];
  const anchor = new Date(task.anchorDate || task.dueDate);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out = [];
  if (task.interval === "weekly") {
    const dow = anchor.getDay();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      if (dt.getDay() === dow) out.push(dt.getTime());
    }
  } else if (task.interval === "monthly") {
    const dom = Math.min(anchor.getDate(), daysInMonth);
    out.push(new Date(year, month, dom).getTime());
  } else if (task.interval === "quarterly") {
    const anchorMonthIdx = anchor.getFullYear() * 12 + anchor.getMonth();
    const thisMonthIdx = year * 12 + month;
    if (((thisMonthIdx - anchorMonthIdx) % 3 + 3) % 3 === 0) {
      const dom = Math.min(anchor.getDate(), daysInMonth);
      out.push(new Date(year, month, dom).getTime());
    }
  }
  return out;
}
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateInput(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}
function isSameDay(a, b) {
  const da = new Date(a), db_ = new Date(b);
  return da.getFullYear() === db_.getFullYear() && da.getMonth() === db_.getMonth() && da.getDate() === db_.getDate();
}
function startOfDay(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
}
function isOverdue(task) {
  return task.status !== "Done" && task.status !== "Blocked" && task.dueDate && task.dueDate < startOfDay(Date.now());
}
function daysAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return diff;
}
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d).getTime());
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
function seedTasks() {
  const now = Date.now();

  // --- Cadence anchor helpers: find the next real occurrence of a weekday,
  // a day-of-month, or a quarter-start month, from today. These become the
  // permanent `anchorDate` for each recurring task, driving both its first
  // due date and its calendar projection pattern going forward.
  function nextWeekday(targetDow) {
    const d = new Date(startOfDay(now));
    const diff = (targetDow - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d.getTime();
  }
  function nextDayOfMonth(targetDom) {
    const d = new Date(startOfDay(now));
    let candidate = new Date(d.getFullYear(), d.getMonth(), targetDom);
    if (candidate.getTime() < d.getTime()) candidate = new Date(d.getFullYear(), d.getMonth() + 1, targetDom);
    return candidate.getTime();
  }
  // Program quarters run Feb/May/Aug/Nov (the award's Feb 2 effective date).
  function nextQuarterDay(offsetDay) {
    const quarterMonths = [1, 4, 7, 10]; // 0-indexed: Feb, May, Aug, Nov
    const d = new Date(startOfDay(now));
    let best = null;
    for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
      for (const m of quarterMonths) {
        const candidate = new Date(d.getFullYear() + yearOffset, m, offsetDay);
        if (candidate.getTime() >= d.getTime() && (!best || candidate.getTime() < best.getTime())) best = candidate;
      }
    }
    return best.getTime();
  }

  const kickoff = [
    ["Kickoff meeting with MIA and all 3 subrecipients held", "Grant Program Manager", "2026-02-13"],
    ["Subaward agreements drafted for all 3 subrecipients", "Grant Program Manager", "2026-03-06"],
    ["Subaward agreements executed for all 3 subrecipients", "Grants Accountant", "2026-04-03"],
    ["Applicant vetting rubric finalized with grant partners", "Grant Program Manager", "2026-03-06"],
    ["Vetting committee established, cadence set", "Grant Program Manager", "2026-02-27"],
    ["Program brand, marketing assets, and landing page copy ready", "Marketing Manager", "2026-03-20"],
    ["Application intake form and CRM workflow live", "Data / CRM Analyst", "2026-03-20"],
    ["Company eligibility check (SBA tool) configured into intake flow", "Data / CRM Analyst", "2026-03-20"],
    ["Landing page launched, applications open", "Marketing Manager", "2026-03-20"],
    ["All subawards confirmed fully executed", "Grant Program Manager", "2026-04-03"],
    ["Tranche 1 subaward funds passed through to all 3 subrecipients", "Grants Accountant", "2026-05-03"],
    ["Subrecipient identity/selection question raised with MIA", "Grant Program Manager", "2026-02-13"],
    ["Company sourcing/lead-generation ownership confirmed with MIA", "Grant Program Manager", "2026-02-13"],
  ];
  // Daily: anchored to today — "due every day" is trivial by definition, so
  // these don't get calendar-projected (see occurrencesInMonth).
  const daily = [
    ["Check Dashboard for status/pipeline movement", "Grant Program Manager"],
    ["Review new applications received", "Grant Program Manager"],
    ["Monitor vetting committee / subrecipient correspondence", "Grant Program Manager"],
    ["Log service delivery updates from subrecipients", "Data / CRM Analyst"],
  ];
  // Weekly: spread across the work week, Monday through Friday, so they
  // don't all land on one day.
  const weekly = [
    ["Vetting committee meeting prep (if scheduled this week)", "Grant Program Manager", 1], // Mon
    ["Update Metrics & Pipeline Tracker with this week's counts", "Data / CRM Analyst", 2], // Tue
    ["Check Subaward & Disbursement Tracker deadlines", "Grants Accountant", 3], // Wed
    ["Check in with each subrecipient on service delivery pace", "Grant Program Manager", 4], // Thu
    ["Scan for new/changed risks", "Grant Program Manager", 5], // Fri
  ];
  // Monthly: spread across specific days of the month in a sensible
  // workflow order (close out last month's numbers first, then plan ahead).
  const monthly = [
    ["Reconcile expenditure vs. 75% tranche threshold", "Grants Accountant", 1],
    ["Update Budget Actuals tab", "Grants Accountant", 3],
    ["Hold monthly vetting committee meeting", "Vetting Committee", 5],
    ["Roll up Metrics & Pipeline Tracker monthly totals", "Data / CRM Analyst", 7],
    ["Review company routing balance across the 3 subrecipients", "Grant Program Manager", 10],
    ["Check upcoming reporting deadline prep window", "Grant Program Manager", 12],
  ];
  // Quarterly: anchored to the program's own quarter cadence (Feb/May/Aug/Nov,
  // matching the Feb 2 effective date), spread across the first week.
  const quarterly = [
    ["Full budget category review (A-I) vs. actuals", "Grants Accountant", 1],
    ["Subrecipient relationship / capacity check-in", "Grant Program Manager", 3],
    ["Full Risk Register review and rescoring", "Grant Program Manager", 5],
    ["Review Assumptions / Flagged Gaps / Open Questions", "Grant Program Manager", 7],
  ];

  const tasks = {};
  let n = 0;
  const push = (title, owner, bucket, dueDate, recurring, anchorDate) => {
    n += 1;
    const id = `t${n}`;
    tasks[id] = {
      id, title, owner, bucket, status: "Not Started",
      dueDate, anchorDate: anchorDate ?? dueDate, recurring, interval: recurring ? BUCKET_DEFAULT_INTERVAL[bucket] : null,
      notes: "", completedCount: 0, lastCompletedAt: null, createdAt: now,
    };
  };

  kickoff.forEach(([title, owner, date]) => push(title, owner, "Kickoff", new Date(date + "T00:00:00").getTime(), false));
  daily.forEach(([title, owner]) => push(title, owner, "Daily", startOfDay(now), true));
  weekly.forEach(([title, owner, dow]) => { const d = nextWeekday(dow); push(title, owner, "Weekly", d, true, d); });
  monthly.forEach(([title, owner, dom]) => { const d = nextDayOfMonth(dom); push(title, owner, "Monthly", d, true, d); });
  quarterly.forEach(([title, owner, offset]) => { const d = nextQuarterDay(offset); push(title, owner, "Quarterly", d, true, d); });

  return tasks;
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function Logo() {
  return (
    <a href="https://automationalley.com" target="_blank" rel="noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
        <path d="M16 10 H58 L84 36 V90 H68 V52 L16 52 Z M16 52 H68 V90 H16 Z" fill={COLORS.gold} />
        <rect x="16" y="24" width="34" height="14" fill={COLORS.ink} />
        <rect x="30" y="64" width="26" height="14" fill={COLORS.ink} />
      </svg>
      <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.paper }}>
        MAMAP Task Tracker
      </span>
    </a>
  );
}

function StatusPill({ status, onClick }) {
  const meta = STATUS_META[status] || STATUS_META["Not Started"];
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999,
      fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: meta.color, background: meta.bg,
      border: "none", cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap",
    }}>
      {status}
    </button>
  );
}

const btnGold = {
  display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.gold, color: COLORS.ink,
  border: "none", borderRadius: 7, padding: "9px 16px", fontFamily: "Inter, sans-serif", fontWeight: 700,
  fontSize: 13.5, cursor: "pointer",
};
const btnGhost = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: COLORS.ink,
  border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "9px 14px", fontFamily: "Inter, sans-serif",
  fontWeight: 600, fontSize: 13.5, cursor: "pointer",
};
const labelStyle = {
  display: "block", fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600,
  color: COLORS.slate, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3,
};
const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 7, border: `1px solid ${COLORS.line}`,
  fontFamily: "Inter, sans-serif", fontSize: 13.5, color: COLORS.ink, background: COLORS.paper, boxSizing: "border-box",
};

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------
function TaskCard({ task, onCycleStatus, onEdit, onDelete }) {
  const overdue = isOverdue(task);
  return (
    <div style={{
      background: COLORS.paper, border: `1px solid ${overdue ? COLORS.bad : COLORS.line}`, borderRadius: 10,
      padding: 14, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.ink, lineHeight: 1.3 }}>
          {task.title}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(task)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: COLORS.slateLight }}>
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(task)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: COLORS.slateLight }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <StatusPill status={task.status} onClick={() => onCycleStatus(task)} />
        {task.recurring && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.slateLight }}>
            <Repeat size={11} /> {task.interval}
          </span>
        )}
        {overdue && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.bad }}>
            <AlertTriangle size={11} /> Overdue
          </span>
        )}
      </div>

      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.slate }}>
        {task.owner}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.slateLight }}>
        <span><Clock size={11} style={{ display: "inline", verticalAlign: -1, marginRight: 4 }} />{fmtDate(task.dueDate)}</span>
        {task.recurring && task.lastCompletedAt && (
          <span>last done {daysAgo(task.lastCompletedAt)}d ago</span>
        )}
      </div>
      {task.notes && (
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.slate, borderTop: `1px solid ${COLORS.line}`, paddingTop: 8 }}>
          {task.notes}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Task Modal
// ---------------------------------------------------------------------------
function TaskModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    title: "", bucket: "Daily", owner: OWNERS[0], dueDate: Date.now(),
    recurring: true, interval: "daily", notes: "",
  });
  const update = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === "bucket") {
      next.recurring = BUCKET_DEFAULT_INTERVAL[v] !== null;
      next.interval = BUCKET_DEFAULT_INTERVAL[v];
    }
    return next;
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,10,11,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
    }} onClick={onClose}>
      <div style={{ background: COLORS.paper, borderRadius: 12, padding: 28, maxWidth: 460, width: "100%", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: COLORS.ink, margin: 0 }}>
            {initial ? "Edit task" : "Add task"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.slateLight }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Bucket</label>
              <select style={inputStyle} value={form.bucket} onChange={(e) => update("bucket", e.target.value)}>
                {BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <select style={inputStyle} value={form.owner} onChange={(e) => update("owner", e.target.value)}>
                {OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Due date</label>
              <input type="date" style={inputStyle} value={fmtDateInput(form.dueDate)}
                onChange={(e) => update("dueDate", new Date(e.target.value + "T00:00:00").getTime())} />
            </div>
            <div>
              <label style={labelStyle}>Recurring</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38 }}>
                <input type="checkbox" checked={form.recurring} onChange={(e) => update("recurring", e.target.checked)} />
                {form.recurring && (
                  <select style={{ ...inputStyle, padding: "6px 8px" }} value={form.interval || "weekly"} onChange={(e) => update("interval", e.target.value)}>
                    {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnGold} onClick={() => onSave(form)} disabled={!form.title.trim()}>
            {initial ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// My Day — the default landing view: overdue, due today, coming up
// ---------------------------------------------------------------------------
function MyDayView({ tasks, onCycleStatus, onEdit, onDelete }) {
  const list = Object.values(tasks).filter((t) => t.status !== "Done" || isSameDay(t.dueDate, Date.now()));
  const today = startOfDay(Date.now());
  const in4Days = today + 4 * 86400000;

  const overdue = list.filter((t) => isOverdue(t)).sort((a, b) => a.dueDate - b.dueDate);
  const dueToday = list.filter((t) => t.dueDate && isSameDay(t.dueDate, today) && !isOverdue(t));
  const comingUp = list.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= in4Days)
    .sort((a, b) => a.dueDate - b.dueDate);

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.ink, marginBottom: 2 }}>
        My Day
      </h2>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight, marginBottom: 24 }}>
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <DaySection title="Overdue" icon={AlertTriangle} color={COLORS.bad} tasks={overdue}
        onCycleStatus={onCycleStatus} onEdit={onEdit} onDelete={onDelete}
        empty="Nothing overdue." />

      <DaySection title="Due today" icon={Clock} color={COLORS.warn} tasks={dueToday}
        onCycleStatus={onCycleStatus} onEdit={onEdit} onDelete={onDelete}
        empty="Nothing due today." />

      <DaySection title="Coming up (next 4 days)" icon={CalendarIcon} color={COLORS.info} tasks={comingUp}
        onCycleStatus={onCycleStatus} onEdit={onEdit} onDelete={onDelete}
        empty="Nothing on deck for the next few days." />
    </div>
  );
}

function DaySection({ title, icon: Icon, color, tasks, onCycleStatus, onEdit, onDelete, empty }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon size={16} color={color} />
        <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.ink, margin: 0 }}>{title}</h3>
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color,
          background: `${color}18`, padding: "2px 8px", borderRadius: 999,
        }}>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight, paddingLeft: 24 }}>{empty}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} onCycleStatus={onCycleStatus} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

function DashboardView({ tasks }) {
  const list = Object.values(tasks);
  const overdue = list.filter(isOverdue);
  const dueSoon = list.filter((t) => t.status !== "Done" && t.dueDate && t.dueDate >= startOfDay(Date.now()) && t.dueDate <= Date.now() + 7 * 86400000);
  const kickoffTasks = list.filter((t) => t.bucket === "Kickoff");
  const kickoffDone = kickoffTasks.filter((t) => t.status === "Done").length;

  const byBucket = BUCKETS.map((b) => ({ bucket: b, count: list.filter((t) => t.bucket === b).length }));
  const byStatus = STATUSES.map((s) => ({ name: s, value: list.filter((t) => t.status === s).length }));
  const PIE_COLORS = [COLORS.slateLight, COLORS.warn, COLORS.good, COLORS.bad];

  const upcoming = [...list].filter((t) => t.status !== "Done").sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0)).slice(0, 6);

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.ink, marginBottom: 20 }}>
        Task Overview
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard label="Kickoff progress" value={`${kickoffDone}/${kickoffTasks.length}`} accent />
        <StatCard label="Overdue" value={overdue.length} warn={overdue.length > 0} />
        <StatCard label="Due in next 7 days" value={dueSoon.length} />
        <StatCard label="Total active tasks" value={list.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.ink, marginBottom: 14 }}>Tasks by bucket</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byBucket} margin={{ left: -20 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontFamily: "Inter, sans-serif", fontSize: 11, fill: COLORS.slate }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontFamily: "Inter, sans-serif", fontSize: 11, fill: COLORS.slate }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12, borderRadius: 6 }} />
              <Bar dataKey="count" fill={COLORS.gold} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.ink, marginBottom: 14 }}>By status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={{ fontFamily: "Inter, sans-serif", fontSize: 10 }}>
                {byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontFamily: "Inter, sans-serif", fontSize: 12, borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 20 }}>
        <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.ink, marginBottom: 14 }}>Coming up</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {upcoming.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${COLORS.line}` }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.ink }}>{t.title}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: isOverdue(t) ? COLORS.bad : COLORS.slateLight }}>{fmtDate(t.dueDate)}</span>
            </div>
          ))}
          {upcoming.length === 0 && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight }}>Nothing upcoming — nice.</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, warn }) {
  return (
    <div style={{
      background: accent ? COLORS.ink : COLORS.paper,
      border: `1px solid ${warn ? COLORS.bad : accent ? COLORS.ink : COLORS.line}`,
      borderRadius: 10, padding: 18,
    }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: accent ? "#C7C7C9" : COLORS.slateLight, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: warn ? COLORS.bad : accent ? COLORS.gold : COLORS.ink, marginTop: 6 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
function CalendarView({ tasks, onEdit }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(startOfDay(Date.now()));

  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);
  const list = Object.values(tasks);
  const tasksForDay = (dayTs) => list.filter((t) => t.dueDate && isSameDay(t.dueDate, dayTs));
  const selectedTasks = tasksForDay(selectedDay);

  // Projected occurrences (Weekly/Monthly/Quarterly cadence pattern) for the
  // visible month — shown as lighter dots so the calendar reflects the real
  // recurrence pattern, not just each task's single next due date.
  const projectedByDay = useMemo(() => {
    const map = {};
    list.forEach((t) => {
      occurrencesInMonth(t, year, month).forEach((ts) => {
        const key = startOfDay(ts);
        map[key] = map[key] || [];
        map[key].push(t);
      });
    });
    return map;
  }, [tasks, year, month]);

  const goPrev = () => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const goNext = () => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 18, color: COLORS.ink, margin: 0 }}>
              {new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={goPrev} style={btnGhost}><ChevronLeft size={15} /></button>
              <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(startOfDay(Date.now())); }} style={btnGhost}>Today</button>
              <button onClick={goNext} style={btnGhost}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.slateLight }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {week.map((dayTs, di) => {
                if (!dayTs) return <div key={di} />;
                const dayTasks = tasksForDay(dayTs);
                const projectedIds = new Set(dayTasks.map((t) => t.id));
                const projectedOnly = (projectedByDay[dayTs] || []).filter((t) => !projectedIds.has(t.id));
                const isToday = isSameDay(dayTs, Date.now());
                const isSelected = isSameDay(dayTs, selectedDay);
                return (
                  <button key={di} onClick={() => setSelectedDay(dayTs)} style={{
                    minHeight: 62, padding: 6, borderRadius: 8, textAlign: "left", cursor: "pointer",
                    border: `1px solid ${isSelected ? COLORS.gold : COLORS.line}`,
                    background: isSelected ? COLORS.goldSoft : isToday ? COLORS.stone : COLORS.paper,
                  }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: isToday ? COLORS.ink : COLORS.slateLight, fontWeight: isToday ? 700 : 400 }}>
                      {new Date(dayTs).getDate()}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 4 }}>
                      {dayTasks.slice(0, 4).map((t) => (
                        <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_META[t.status].color }} />
                      ))}
                      {projectedOnly.slice(0, 4).map((t) => (
                        <span key={t.id} title={`${t.title} (recurs this day)`} style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.slateLight, opacity: 0.45 }} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 14, color: COLORS.ink, marginBottom: 12 }}>
            {new Date(selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </h3>
          <div style={{ display: "grid", gap: 10 }}>
            {selectedTasks.map((t) => <TaskCardMini key={t.id} task={t} onEdit={onEdit} />)}
            {selectedTasks.length === 0 && (
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight }}>Nothing due this day.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCardMini({ task, onEdit }) {
  return (
    <button onClick={() => onEdit(task)} style={{
      display: "block", width: "100%", textAlign: "left", background: COLORS.stone, border: `1px solid ${COLORS.line}`,
      borderRadius: 8, padding: 10, cursor: "pointer",
    }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{task.title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <StatusPill status={task.status} />
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.slateLight }}>{task.owner}</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bucket view
// ---------------------------------------------------------------------------
function BucketView({ bucket, tasks, onCycleStatus, onEdit, onDelete }) {
  const list = Object.values(tasks).filter((t) => t.bucket === bucket).sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 22, color: COLORS.ink, marginBottom: 4 }}>{bucket}</h2>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight, marginBottom: 20 }}>{list.length} tasks</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {list.map((t) => (
          <TaskCard key={t.id} task={t} onCycleStatus={onCycleStatus} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {list.length === 0 && (
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.slateLight }}>No tasks in this bucket yet.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
export default function App() {
  const [tasks, setTasks] = useState({});
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [view, setView] = useState("myday");
  const [modalTask, setModalTask] = useState(undefined); // undefined = closed, null = new, obj = edit

  useEffect(() => {
    const tasksRef = dbRef(db, "tasks");
    dbGet(tasksRef).then((snap) => {
      if (!snap.exists()) return dbSet(tasksRef, seedTasks());
    }).catch(() => setSyncStatus("offline"));

    const unsubscribe = onValue(tasksRef, (snap) => {
      setTasks(snap.val() || {});
      setSyncStatus("live");
    }, () => setSyncStatus("offline"));

    return () => unsubscribe();
  }, []);

  const saveTask = (form) => {
    const id = form.id || `t${Date.now()}`;
    const record = { ...form, id, anchorDate: form.anchorDate ?? form.dueDate };
    setTasks((prev) => ({ ...prev, [id]: record }));
    dbSet(dbRef(db, `tasks/${id}`), record);
    setModalTask(undefined);
  };

  const deleteTask = (task) => {
    setTasks((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    dbRemove(dbRef(db, `tasks/${task.id}`));
  };

  const cycleStatus = (task) => {
    const idx = STATUSES.indexOf(task.status);
    const nextStatus = STATUSES[(idx + 1) % STATUSES.length];
    let next = { ...task, status: nextStatus };
    if (nextStatus === "Done") {
      next.completedCount = (task.completedCount || 0) + 1;
      next.lastCompletedAt = Date.now();
      if (task.recurring && task.interval) {
        next.dueDate = addInterval(task.dueDate || Date.now(), task.interval);
        next.status = "Not Started";
      }
    }
    setTasks((prev) => ({ ...prev, [task.id]: next }));
    dbSet(dbRef(db, `tasks/${task.id}`), next);
  };

  const NAV = [
    { key: "myday", label: "My Day", icon: Sun },
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "calendar", label: "Calendar", icon: CalendarIcon },
    ...BUCKETS.map((b) => ({ key: `bucket:${b}`, label: b, icon: null })),
  ];

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: COLORS.stone, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: 2px solid ${COLORS.gold}; outline-offset: 1px; }
      `}</style>

      <div style={{ background: COLORS.gold, padding: "6px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.ink, fontWeight: 700 }}>
          MAMAP TASK TRACKER <span style={{ opacity: 0.6, fontWeight: 500 }}>v{APP_VERSION}</span>
        </span>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.ink, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700,
            padding: "2px 8px", borderRadius: 999,
            background: syncStatus === "live" ? "#1F4D2F22" : syncStatus === "offline" ? "#5C1A1A22" : "#00000022",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "live" ? "#1F4D2F" : syncStatus === "offline" ? "#5C1A1A" : COLORS.ink }} />
            {syncStatus === "live" ? "Live" : syncStatus === "offline" ? "Offline (local only)" : "Connecting…"}
          </span>
          {Object.keys(tasks).length} tasks
        </span>
      </div>

      <div style={{ background: COLORS.ink, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {NAV.map((n) => {
            const active = view === n.key;
            const Icon = n.icon;
            return (
              <button key={n.key} onClick={() => setView(n.key)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
                borderBottom: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
                color: active ? COLORS.gold : "#D8D8D9", padding: "8px 12px", cursor: "pointer",
                fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
              }}>
                {Icon && <Icon size={14} />} {n.label}
              </button>
            );
          })}
          <button onClick={() => setModalTask(null)} style={{ ...btnGold, marginLeft: 8 }}>
            <Plus size={15} /> Add task
          </button>
        </div>
      </div>

      {view === "myday" && <MyDayView tasks={tasks} onCycleStatus={cycleStatus} onEdit={setModalTask} onDelete={deleteTask} />}
      {view === "dashboard" && <DashboardView tasks={tasks} />}
      {view === "calendar" && <CalendarView tasks={tasks} onEdit={setModalTask} />}
      {BUCKETS.map((b) => view === `bucket:${b}` && (
        <BucketView key={b} bucket={b} tasks={tasks} onCycleStatus={cycleStatus} onEdit={setModalTask} onDelete={deleteTask} />
      ))}

      {modalTask !== undefined && (
        <TaskModal initial={modalTask} onSave={saveTask} onClose={() => setModalTask(undefined)} />
      )}

      <div style={{ textAlign: "center", padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.slateLight }}>
        Demo build for the Grant Program Manager assessment — not affiliated with or endorsed by Automation Alley's production systems.
      </div>
    </div>
  );
}
