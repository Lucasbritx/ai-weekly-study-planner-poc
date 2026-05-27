import { Codex } from "@openai/codex-sdk";
import { startOfWeek } from "./sampleData.js";

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export async function generateStudyPlan({ goals, preferences, busyBlocks, timezone = DEFAULT_TIMEZONE }) {
  const normalizedGoals = normalizeGoals(goals);
  const normalizedPreferences = normalizePreferences(preferences);
  const aiPlan = await tryCodexPlan({
    goals: normalizedGoals,
    preferences: normalizedPreferences,
    busyBlocks,
    timezone
  });

  const draft = aiPlan?.sessions?.length
    ? aiPlan
    : deterministicPlan({
        goals: normalizedGoals,
        preferences: normalizedPreferences,
        busyBlocks,
        timezone
      });

  return {
    ...draft,
    sessions: validateAndRepairSessions(draft.sessions, busyBlocks, normalizedPreferences),
    generatedAt: new Date().toISOString()
  };
}

async function tryCodexPlan(payload) {
  if (process.env.USE_CODEX_SDK !== "true") {
    return null;
  }

  const prompt = [
    "Create a weekly study plan as strict JSON only.",
    "Return this shape: {\"sessions\":[{\"id\":\"string\",\"title\":\"Study: Subject\",\"subject\":\"string\",\"start\":\"ISO\",\"end\":\"ISO\",\"rationale\":\"string\",\"priority\":\"High|Medium|Low\",\"confidence\":0.0}]}",
    "Constraints: do not overlap busy blocks, stay inside preferred hours, prioritize earlier deadlines, and use the requested session length.",
    JSON.stringify(payload, null, 2)
  ].join("\n\n");

  try {
    const codex = new Codex();
    const thread = codex.startThread();
    const result = await thread.run(prompt);
    const raw = typeof result === "string" ? result : result?.final_response || result?.finalResponse || String(result);
    return JSON.parse(extractJson(raw));
  } catch (error) {
    console.warn("Codex SDK planning failed; using deterministic fallback.", error.message);
    return null;
  }
}

function deterministicPlan({ goals, preferences, busyBlocks, timezone }) {
  const slots = buildCandidateSlots(preferences, busyBlocks);
  const orderedGoals = [...goals].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const sessions = [];
  let slotIndex = 0;

  for (const goal of orderedGoals) {
    const targetSessions = Math.max(1, Math.ceil(Number(goal.hours || 2) / (preferences.sessionLengthMinutes / 60)));

    for (let count = 0; count < targetSessions && slotIndex < slots.length; count += 1) {
      const slot = slots[slotIndex];
      slotIndex += 1;
      sessions.push({
        id: `draft-${goal.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${count + 1}`,
        title: `Study: ${goal.subject}`,
        subject: goal.subject,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        rationale: `Scheduled before ${formatDate(goal.deadline)} with space around existing calendar commitments.`,
        priority: goal.priority,
        confidence: 0.82,
        status: "draft",
        timezone
      });
    }
  }

  return {
    source: "fallback",
    sessions
  };
}

function buildCandidateSlots(preferences, busyBlocks) {
  const weekStart = startOfWeek(new Date());
  const slots = [];
  const busy = busyBlocks.map((block) => ({
    start: new Date(block.start),
    end: new Date(block.end)
  }));

  for (let day = 0; day < 6; day += 1) {
    const cursor = new Date(weekStart);
    cursor.setDate(weekStart.getDate() + day);
    cursor.setHours(preferences.startHour, 0, 0, 0);

    const dayEnd = new Date(cursor);
    dayEnd.setHours(preferences.endHour, 0, 0, 0);

    while (cursor.getTime() + preferences.sessionLengthMinutes * 60_000 <= dayEnd.getTime()) {
      const start = new Date(cursor);
      const end = new Date(cursor.getTime() + preferences.sessionLengthMinutes * 60_000);
      if (!overlapsAny(start, end, busy)) {
        slots.push({ start, end });
      }
      cursor.setTime(cursor.getTime() + (preferences.sessionLengthMinutes + preferences.breakMinutes) * 60_000);
    }
  }

  return slots;
}

function validateAndRepairSessions(sessions, busyBlocks, preferences) {
  const busy = busyBlocks.map((block) => ({ start: new Date(block.start), end: new Date(block.end) }));
  const accepted = [];

  for (const session of sessions) {
    const start = new Date(session.start);
    const end = new Date(session.end);
    const duration = (end - start) / 60_000;
    const withinHours = start.getHours() >= preferences.startHour && end.getHours() <= preferences.endHour;
    const validDuration = duration >= 30 && duration <= 180;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end <= start || !withinHours || !validDuration) continue;
    if (overlapsAny(start, end, [...busy, ...accepted])) continue;

    accepted.push({
      ...session,
      status: session.status || "draft",
      validation: "ok"
    });
  }

  return accepted;
}

function normalizeGoals(goals = []) {
  const fallbackDeadline = new Date();
  fallbackDeadline.setDate(fallbackDeadline.getDate() + 7);

  return goals
    .filter((goal) => goal.subject?.trim())
    .map((goal) => ({
      subject: goal.subject.trim(),
      deadline: goal.deadline || fallbackDeadline.toISOString().slice(0, 10),
      priority: goal.priority || "Medium",
      hours: Number(goal.hours || 2)
    }));
}

function normalizePreferences(preferences = {}) {
  return {
    startHour: Number(preferences.startHour || 8),
    endHour: Number(preferences.endHour || 21),
    sessionLengthMinutes: Number(preferences.sessionLengthMinutes || 90),
    breakMinutes: Number(preferences.breakMinutes || 15),
    weeklyTargetHours: Number(preferences.weeklyTargetHours || 10)
  };
}

function overlapsAny(start, end, blocks) {
  return blocks.some((block) => start < block.end && end > block.start);
}

function extractJson(value) {
  const text = String(value).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function formatDate(value) {
  const date = String(value).length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}
