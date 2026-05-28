import "dotenv/config";
import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireUser } from "./auth.js";
import { createStudyEvents, getCalendarStatus, listBusyBlocks } from "./googleCalendar.js";
import { generateStudyPlan } from "./planner.js";
import { startOfWeek } from "./sampleData.js";
import {
  getGoals,
  getLatestPlan,
  getPreferences,
  isPersistentStoreConfigured,
  saveGoals,
  saveGoogleConnection,
  savePlan,
  savePreferences,
  upsertProfile
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://localhost:5173";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-weekly-study-planner-poc" });
});

app.get("/api/status", requireUser, async (req, res, next) => {
  try {
    await upsertProfile(req.user);
    res.json({
      authMode: req.authMode,
      persistence: isPersistentStoreConfigured() ? "supabase" : "memory",
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.user_metadata?.full_name || req.user.user_metadata?.name || req.user.email
      },
      calendar: await getCalendarStatus(req.user.id)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/google-connection", requireUser, async (req, res, next) => {
  try {
    await upsertProfile(req.user);
    const connection = await saveGoogleConnection(req.user.id, {
      providerToken: req.body.providerToken,
      providerRefreshToken: req.body.providerRefreshToken,
      expiresAt: req.body.expiresAt,
      expiresIn: req.body.expiresIn,
      scope: req.body.scope,
      scopes: req.body.scopes
    });
    res.json({
      connected: connection.status === "connected",
      reconnectRequired: connection.status === "needs_reconnect",
      scopes: connection.scopes
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireUser, async (req, res, next) => {
  try {
    await upsertProfile(req.user);
    const [goals, preferences, latestPlan, calendar] = await Promise.all([
      getGoals(req.user.id),
      getPreferences(req.user.id),
      getLatestPlan(req.user.id),
      getCalendarStatus(req.user.id)
    ]);
    res.json({
      goals,
      preferences,
      latestPlan,
      calendar,
      persistence: isPersistentStoreConfigured() ? "supabase" : "memory"
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/goals", requireUser, async (req, res, next) => {
  try {
    res.json({ goals: await saveGoals(req.user.id, req.body.goals || []) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/preferences", requireUser, async (req, res, next) => {
  try {
    res.json({ preferences: await savePreferences(req.user.id, req.body.preferences || {}) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/calendar/busy", requireUser, async (req, res, next) => {
  try {
    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const result = await listBusyBlocks(req.user.id, {
      timeMin: weekStart.toISOString(),
      timeMax: weekEnd.toISOString()
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/plan", requireUser, async (req, res, next) => {
  try {
    await upsertProfile(req.user);
    const persistedGoals = await saveGoals(req.user.id, req.body.goals || []);
    const persistedPreferences = await savePreferences(req.user.id, req.body.preferences || {});
    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const calendar = await listBusyBlocks(req.user.id, {
      timeMin: weekStart.toISOString(),
      timeMax: weekEnd.toISOString()
    });
    const plan = await generateStudyPlan({
      goals: persistedGoals,
      preferences: persistedPreferences,
      busyBlocks: calendar.busyBlocks,
      timezone: req.body.timezone
    });
    await savePlan(req.user.id, {
      weekStart,
      weekEnd,
      source: plan.source,
      calendarMode: calendar.mode,
      sessions: plan.sessions
    });
    res.json({
      ...plan,
      calendarMode: calendar.mode,
      busyBlocks: calendar.busyBlocks
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/calendar/events", requireUser, async (req, res, next) => {
  try {
    const sessions = Array.isArray(req.body.sessions) ? req.body.sessions : [];
    if (!sessions.length) {
      res.status(400).json({ error: "No sessions selected for calendar creation." });
      return;
    }
    res.json(await createStudyEvents(req.user.id, sessions));
  } catch (error) {
    next(error);
  }
});

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("*", (_req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || "Unexpected server error."
  });
});

app.listen(port, host, () => {
  console.log(`Study planner API listening on http://${host}:${port}`);
});
