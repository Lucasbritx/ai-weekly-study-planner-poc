import "dotenv/config";
import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStudyEvents, getAuthUrl, getConnectionStatus, handleOAuthCallback, listBusyBlocks } from "./googleCalendar.js";
import { generateStudyPlan } from "./planner.js";
import { startOfWeek } from "./sampleData.js";

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

app.get("/api/status", (_req, res) => {
  res.json(getConnectionStatus());
});

app.get("/api/auth/google", (_req, res) => {
  const url = getAuthUrl();
  if (!url) {
    res.status(409).json({
      error: "Google OAuth is not configured.",
      hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env."
    });
    return;
  }
  res.redirect(url);
});

app.get("/api/auth/google/callback", async (req, res, next) => {
  try {
    if (!req.query.code) {
      res.status(400).json({ error: "Missing Google OAuth authorization code." });
      return;
    }
    await handleOAuthCallback(req.query.code);
    res.redirect(`${clientBaseUrl}?calendar=connected`);
  } catch (error) {
    next(error);
  }
});

app.get("/api/calendar/busy", async (_req, res, next) => {
  try {
    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const result = await listBusyBlocks({
      timeMin: weekStart.toISOString(),
      timeMax: weekEnd.toISOString()
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/plan", async (req, res, next) => {
  try {
    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const calendar = await listBusyBlocks({
      timeMin: weekStart.toISOString(),
      timeMax: weekEnd.toISOString()
    });
    const plan = await generateStudyPlan({
      goals: req.body.goals,
      preferences: req.body.preferences,
      busyBlocks: calendar.busyBlocks,
      timezone: req.body.timezone
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

app.post("/api/calendar/events", async (req, res, next) => {
  try {
    const sessions = Array.isArray(req.body.sessions) ? req.body.sessions : [];
    if (!sessions.length) {
      res.status(400).json({ error: "No sessions selected for calendar creation." });
      return;
    }
    res.json(await createStudyEvents(sessions));
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
  res.status(500).json({
    error: error.message || "Unexpected server error."
  });
});

app.listen(port, host, () => {
  console.log(`Study planner API listening on http://${host}:${port}`);
});
