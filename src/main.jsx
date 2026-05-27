import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarCheck, Check, Clock, Edit3, GraduationCap, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

const initialGoals = [
  { id: crypto.randomUUID(), subject: "Calculus", deadline: nextDate(5), priority: "High", hours: 4 },
  { id: crypto.randomUUID(), subject: "Chemistry", deadline: nextDate(8), priority: "Medium", hours: 3 },
  { id: crypto.randomUUID(), subject: "History", deadline: nextDate(10), priority: "Low", hours: 2 }
];

function App() {
  const [status, setStatus] = useState({ configured: false, connected: false });
  const [busyBlocks, setBusyBlocks] = useState([]);
  const [calendarMode, setCalendarMode] = useState("mock");
  const [goals, setGoals] = useState(initialGoals);
  const [preferences, setPreferences] = useState({
    startHour: 8,
    endHour: 21,
    sessionLengthMinutes: 90,
    breakMinutes: 15,
    weeklyTargetHours: 10
  });
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshCalendar();
    fetch(`${API_BASE}/api/status`).then((res) => res.json()).then(setStatus).catch(() => {});
  }, []);

  const weekDays = useMemo(() => buildWeekDays(), []);
  const totalDraftHours = sessions.reduce((sum, session) => sum + durationHours(session), 0);

  async function refreshCalendar() {
    const response = await fetch(`${API_BASE}/api/calendar/busy`);
    const data = await response.json();
    setBusyBlocks(data.busyBlocks || []);
    setCalendarMode(data.mode || "mock");
  }

  async function generatePlan() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals, preferences, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate a plan.");
      setBusyBlocks(data.busyBlocks || busyBlocks);
      setCalendarMode(data.calendarMode || calendarMode);
      setSessions(data.sessions || []);
      setSelected(new Set((data.sessions || []).map((session) => session.id)));
      setMessage(data.source === "fallback" ? "Draft created with local planner fallback. Enable USE_CODEX_SDK=true for Codex calls." : "Draft created with Codex.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function createSelectedEvents() {
    const approved = sessions.filter((session) => selected.has(session.id));
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/calendar/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: approved })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create events.");
      const createdById = new Map(data.events.map((event) => [event.id, event]));
      setSessions((current) => current.map((session) => createdById.get(session.id) || session));
      setMessage(data.mode === "mock" ? "Events saved in mock mode. Connect Google Calendar to create real events." : "Selected events created in Google Calendar.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateGoal(id, field, value) {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, [field]: value } : goal));
  }

  function addGoal() {
    setGoals((current) => [...current, { id: crypto.randomUUID(), subject: "", deadline: nextDate(7), priority: "Medium", hours: 2 }]);
  }

  function removeGoal(id) {
    setGoals((current) => current.filter((goal) => goal.id !== id));
  }

  function updateSession(id, field, value) {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, [field]: value } : session));
  }

  function toggleSession(id) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow"><GraduationCap size={16} /> AI Study Planner POC</span>
          <h1>Plan the week around the calendar you already have.</h1>
        </div>
        <div className="topbar-actions">
          <a className="button secondary" href={`${API_BASE}/api/auth/google`}>
            <CalendarCheck size={18} /> Connect Google
          </a>
          <button className="button ghost" onClick={refreshCalendar}>
            <RefreshCw size={17} /> Refresh
          </button>
        </div>
      </header>

      <section className="status-strip">
        <StatusItem label="Calendar" value={calendarMode === "google" ? "Google connected" : "Mock mode"} />
        <StatusItem label="OAuth config" value={status.configured ? "Configured" : "Missing .env"} />
        <StatusItem label="Draft hours" value={`${totalDraftHours.toFixed(1)}h / ${preferences.weeklyTargetHours}h target`} />
        <StatusItem label="Approval" value={`${selected.size} selected`} />
      </section>

      <div className="workspace">
        <section className="planner-panel">
          <div className="panel-heading">
            <div>
              <h2>Study inputs</h2>
              <p>Set deadlines, priority, and weekly study preferences.</p>
            </div>
            <button className="icon-button" onClick={addGoal} aria-label="Add subject">
              <Plus size={19} />
            </button>
          </div>

          <div className="goal-list">
            {goals.map((goal) => (
              <div className="goal-row" key={goal.id}>
                <input value={goal.subject} onChange={(event) => updateGoal(goal.id, "subject", event.target.value)} placeholder="Subject" />
                <input type="date" value={goal.deadline} onChange={(event) => updateGoal(goal.id, "deadline", event.target.value)} />
                <select value={goal.priority} onChange={(event) => updateGoal(goal.id, "priority", event.target.value)}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
                <input type="number" min="1" max="12" value={goal.hours} onChange={(event) => updateGoal(goal.id, "hours", event.target.value)} aria-label="Target hours" />
                <button className="icon-button subtle" onClick={() => removeGoal(goal.id)} aria-label={`Remove ${goal.subject || "goal"}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="preference-grid">
            <NumberField label="Start hour" value={preferences.startHour} onChange={(value) => setPreferences({ ...preferences, startHour: value })} />
            <NumberField label="End hour" value={preferences.endHour} onChange={(value) => setPreferences({ ...preferences, endHour: value })} />
            <NumberField label="Session min" value={preferences.sessionLengthMinutes} onChange={(value) => setPreferences({ ...preferences, sessionLengthMinutes: value })} />
            <NumberField label="Break min" value={preferences.breakMinutes} onChange={(value) => setPreferences({ ...preferences, breakMinutes: value })} />
            <NumberField label="Week target" value={preferences.weeklyTargetHours} onChange={(value) => setPreferences({ ...preferences, weeklyTargetHours: value })} />
          </div>

          <button className="button primary wide" onClick={generatePlan} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />} Generate weekly plan
          </button>
          {message && <p className="message">{message}</p>}
        </section>

        <section className="calendar-panel">
          <div className="panel-heading">
            <div>
              <h2>Week view</h2>
              <p>Busy blocks are protected; selected drafts can be created as events.</p>
            </div>
            <button className="button primary" onClick={createSelectedEvents} disabled={loading || selected.size === 0}>
              <Check size={17} /> Create selected
            </button>
          </div>
          <CalendarGrid days={weekDays} busyBlocks={busyBlocks} sessions={sessions} selected={selected} onToggle={toggleSession} />
        </section>
      </div>

      <section className="review-panel">
        <div className="panel-heading">
          <div>
            <h2>Review draft sessions</h2>
            <p>Edit titles or times before creating calendar events.</p>
          </div>
        </div>
        <div className="session-list">
          {sessions.length === 0 && <div className="empty-state">Generate a plan to see editable draft study blocks here.</div>}
          {sessions.map((session) => (
            <article className={`session-card ${selected.has(session.id) ? "selected" : ""}`} key={session.id}>
              <label className="checkline">
                <input type="checkbox" checked={selected.has(session.id)} onChange={() => toggleSession(session.id)} />
                <span>{session.status === "created" ? "Created" : "Approve"}</span>
              </label>
              <input value={session.title} onChange={(event) => updateSession(session.id, "title", event.target.value)} />
              <div className="session-card-grid">
                <input type="datetime-local" value={toLocalInput(session.start)} onChange={(event) => updateSession(session.id, "start", new Date(event.target.value).toISOString())} />
                <input type="datetime-local" value={toLocalInput(session.end)} onChange={(event) => updateSession(session.id, "end", new Date(event.target.value).toISOString())} />
              </div>
              <p>{session.rationale}</p>
              <span className="pill"><Clock size={14} /> {durationHours(session).toFixed(1)}h · {session.priority} · {(session.confidence * 100).toFixed(0)}%</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function CalendarGrid({ days, busyBlocks, sessions, selected, onToggle }) {
  return (
    <div className="calendar-grid">
      {days.map((day) => {
        const dayBusy = busyBlocks.filter((block) => sameDay(block.start, day));
        const daySessions = sessions.filter((session) => sameDay(session.start, day));
        return (
          <div className="day-column" key={day.toISOString()}>
            <div className="day-heading">
              <strong>{day.toLocaleDateString("en", { weekday: "short" })}</strong>
              <span>{day.toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
            </div>
            {[...dayBusy.map((block) => ({ ...block, kind: "busy" })), ...daySessions.map((session) => ({ ...session, kind: "study" }))].sort((a, b) => new Date(a.start) - new Date(b.start)).map((item) => (
              <button
                className={`calendar-block ${item.kind} ${selected.has(item.id) ? "active" : ""}`}
                key={item.id}
                onClick={() => item.kind === "study" && onToggle(item.id)}
                disabled={item.kind === "busy"}
              >
                <span>{formatTime(item.start)}-{formatTime(item.end)}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function StatusItem({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function buildWeekDays() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function nextDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function sameDay(value, day) {
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function durationHours(session) {
  return Math.max(0, (new Date(session.end) - new Date(session.start)) / 3_600_000);
}

function toLocalInput(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

createRoot(document.getElementById("root")).render(<App />);
