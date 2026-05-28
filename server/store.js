import { decryptJson, encryptJson } from "./crypto.js";
import { supabaseAdmin, supabaseConfigured } from "./supabaseClient.js";

const memory = {
  profiles: new Map(),
  googleConnections: new Map(),
  goals: new Map(),
  preferences: new Map(),
  plans: new Map(),
  calendarEvents: new Map()
};

const DEFAULT_PREFERENCES = {
  startHour: 8,
  endHour: 21,
  sessionLengthMinutes: 90,
  breakMinutes: 15,
  weeklyTargetHours: 10
};

export function isPersistentStoreConfigured() {
  return supabaseConfigured;
}

export async function upsertProfile(user) {
  const profile = {
    id: user.id,
    email: user.email || null,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Student"
  };

  if (!supabaseConfigured) {
    memory.profiles.set(user.id, profile);
    return profile;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveGoogleConnection(userId, connection) {
  const expiresAt = connection.expiresAt
    ? new Date(connection.expiresAt).toISOString()
    : connection.expiresIn
      ? new Date(Date.now() + Number(connection.expiresIn) * 1000).toISOString()
      : null;
  const scopes = normalizeScopes(connection.scopes || connection.scope);
  const tokenPayload = {
    providerToken: connection.providerToken,
    providerRefreshToken: connection.providerRefreshToken,
    expiresAt
  };

  if (!supabaseConfigured) {
    memory.googleConnections.set(userId, {
      user_id: userId,
      encrypted_tokens: encryptJson(tokenPayload),
      expires_at: expiresAt,
      scopes,
      status: connection.providerRefreshToken ? "connected" : "needs_reconnect"
    });
    return getGoogleConnection(userId);
  }

  const { error } = await supabaseAdmin
    .from("google_connections")
    .upsert({
      user_id: userId,
      encrypted_tokens: encryptJson(tokenPayload),
      expires_at: expiresAt,
      scopes,
      status: connection.providerRefreshToken ? "connected" : "needs_reconnect",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
  if (error) throw error;
  return getGoogleConnection(userId);
}

export async function getGoogleConnection(userId) {
  const row = supabaseConfigured
    ? await selectSingle("google_connections", "user_id", userId)
    : memory.googleConnections.get(userId);

  if (!row) return null;

  return {
    userId,
    tokens: decryptJson(row.encrypted_tokens),
    expiresAt: row.expires_at,
    scopes: row.scopes || [],
    status: row.status || "connected"
  };
}

export async function getGoals(userId) {
  if (!supabaseConfigured) return memory.goals.get(userId) || [];

  const { data, error } = await supabaseAdmin
    .from("study_goals")
    .select("id, subject, deadline, priority, target_hours")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("deadline", { ascending: true });
  if (error) throw error;

  return data.map((goal) => ({
    id: goal.id,
    subject: goal.subject,
    deadline: goal.deadline,
    priority: goal.priority,
    hours: goal.target_hours
  }));
}

export async function saveGoals(userId, goals = []) {
  const normalized = goals
    .filter((goal) => goal.subject?.trim())
    .map((goal) => ({
      id: goal.id,
      subject: goal.subject.trim(),
      deadline: goal.deadline,
      priority: goal.priority || "Medium",
      hours: Number(goal.hours || goal.target_hours || 2)
    }));

  if (!supabaseConfigured) {
    memory.goals.set(userId, normalized);
    return normalized;
  }

  const { error: deleteError } = await supabaseAdmin.from("study_goals").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (!normalized.length) return [];

  const { data, error } = await supabaseAdmin
    .from("study_goals")
    .insert(normalized.map((goal) => ({
      user_id: userId,
      subject: goal.subject,
      deadline: goal.deadline,
      priority: goal.priority,
      target_hours: goal.hours,
      archived: false
    })))
    .select("id, subject, deadline, priority, target_hours");
  if (error) throw error;

  return data.map((goal) => ({
    id: goal.id,
    subject: goal.subject,
    deadline: goal.deadline,
    priority: goal.priority,
    hours: goal.target_hours
  }));
}

export async function getPreferences(userId) {
  if (!supabaseConfigured) return memory.preferences.get(userId) || DEFAULT_PREFERENCES;

  const row = await selectSingle("planner_preferences", "user_id", userId);
  if (!row) return DEFAULT_PREFERENCES;

  return {
    startHour: row.start_hour,
    endHour: row.end_hour,
    sessionLengthMinutes: row.session_length_minutes,
    breakMinutes: row.break_minutes,
    weeklyTargetHours: row.weekly_target_hours
  };
}

export async function savePreferences(userId, preferences = DEFAULT_PREFERENCES) {
  const normalized = {
    startHour: Number(preferences.startHour || 8),
    endHour: Number(preferences.endHour || 21),
    sessionLengthMinutes: Number(preferences.sessionLengthMinutes || 90),
    breakMinutes: Number(preferences.breakMinutes || 15),
    weeklyTargetHours: Number(preferences.weeklyTargetHours || 10)
  };

  if (!supabaseConfigured) {
    memory.preferences.set(userId, normalized);
    return normalized;
  }

  const { error } = await supabaseAdmin
    .from("planner_preferences")
    .upsert({
      user_id: userId,
      start_hour: normalized.startHour,
      end_hour: normalized.endHour,
      session_length_minutes: normalized.sessionLengthMinutes,
      break_minutes: normalized.breakMinutes,
      weekly_target_hours: normalized.weeklyTargetHours,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
  if (error) throw error;
  return normalized;
}

export async function savePlan(userId, { weekStart, weekEnd, source, calendarMode, sessions }) {
  const plan = {
    id: crypto.randomUUID(),
    user_id: userId,
    week_start: toDateOnly(weekStart),
    week_end: toDateOnly(weekEnd),
    source: source || "fallback",
    calendar_mode: calendarMode || "mock",
    generated_at: new Date().toISOString()
  };

  if (!supabaseConfigured) {
    memory.plans.set(userId, { ...plan, sessions });
    return { ...plan, sessions };
  }

  const { data: savedPlan, error: planError } = await supabaseAdmin
    .from("plans")
    .insert(plan)
    .select()
    .single();
  if (planError) throw planError;

  if (sessions?.length) {
    const { error: sessionError } = await supabaseAdmin
      .from("plan_sessions")
      .insert(sessions.map((session) => sessionToRow(savedPlan.id, userId, session)));
    if (sessionError) throw sessionError;
  }

  return getLatestPlan(userId);
}

export async function getLatestPlan(userId) {
  if (!supabaseConfigured) return memory.plans.get(userId) || null;

  const { data: plans, error: planError } = await supabaseAdmin
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1);
  if (planError) throw planError;
  if (!plans.length) return null;

  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from("plan_sessions")
    .select("*")
    .eq("plan_id", plans[0].id)
    .order("starts_at", { ascending: true });
  if (sessionError) throw sessionError;

  return {
    ...plans[0],
    sessions: sessions.map(rowToSession)
  };
}

export async function recordCreatedEvents(userId, events = []) {
  if (!events.length) return events;

  if (!supabaseConfigured) {
    const current = memory.calendarEvents.get(userId) || [];
    memory.calendarEvents.set(userId, [...current, ...events]);
    const plan = memory.plans.get(userId);
    if (plan) {
      plan.sessions = plan.sessions.map((session) => events.find((event) => event.id === session.id) || session);
      memory.plans.set(userId, plan);
    }
    return events;
  }

  for (const event of events) {
    const { data: sessions, error: lookupError } = await supabaseAdmin
      .from("plan_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("draft_id", event.id)
      .limit(1);
    if (lookupError) throw lookupError;
    const sessionId = sessions[0]?.id;
    if (!sessionId) continue;

    const { error: updateError } = await supabaseAdmin
      .from("plan_sessions")
      .update({ status: "created", calendar_event_id: event.calendarEventId })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (updateError) throw updateError;

    const { error: insertError } = await supabaseAdmin
      .from("calendar_events")
      .insert({
        user_id: userId,
        plan_session_id: sessionId,
        google_event_id: event.calendarEventId,
        html_link: event.htmlLink
      });
    if (insertError) throw insertError;
  }

  return events;
}

async function selectSingle(table, column, value) {
  const { data, error } = await supabaseAdmin.from(table).select("*").eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}

function sessionToRow(planId, userId, session) {
  return {
    plan_id: planId,
    user_id: userId,
    draft_id: session.id,
    subject: session.subject,
    title: session.title,
    starts_at: session.start,
    ends_at: session.end,
    rationale: session.rationale,
    priority: session.priority,
    confidence: session.confidence,
    status: session.status || "draft",
    timezone: session.timezone,
    calendar_event_id: session.calendarEventId || null
  };
}

function rowToSession(row) {
  return {
    id: row.draft_id,
    title: row.title,
    subject: row.subject,
    start: row.starts_at,
    end: row.ends_at,
    rationale: row.rationale,
    priority: row.priority,
    confidence: row.confidence,
    status: row.status,
    timezone: row.timezone,
    calendarEventId: row.calendar_event_id,
    validation: "ok"
  };
}

function normalizeScopes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}
