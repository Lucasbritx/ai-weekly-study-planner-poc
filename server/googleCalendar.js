import { google } from "googleapis";
import { getMockBusyBlocks } from "./sampleData.js";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy"
];

const tokenStore = new Map();
const createdEvents = [];

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl() {
  const client = getOAuthClient();
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });
}

export async function handleOAuthCallback(code) {
  const client = getOAuthClient();
  if (!client) throw new Error("Google OAuth is not configured.");

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  tokenStore.set("demo-user", tokens);
  return tokens;
}

export async function listBusyBlocks({ timeMin, timeMax }) {
  const client = getAuthorizedClient();
  if (!client) {
    return {
      connected: false,
      busyBlocks: getMockBusyBlocks(),
      mode: "mock"
    };
  }

  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: "primary" }]
    }
  });

  const busy = response.data.calendars?.primary?.busy || [];
  return {
    connected: true,
    mode: "google",
    busyBlocks: busy.map((block, index) => ({
      id: `google-busy-${index}`,
      title: "Busy",
      start: block.start,
      end: block.end,
      source: "google"
    }))
  };
}

export async function createStudyEvents(sessions) {
  const client = getAuthorizedClient();
  if (!client) {
    const saved = sessions.map((session) => ({
      ...session,
      status: "created",
      calendarEventId: `mock-event-${crypto.randomUUID()}`,
      htmlLink: null
    }));
    createdEvents.push(...saved);
    return {
      mode: "mock",
      events: saved
    };
  }

  const calendar = google.calendar({ version: "v3", auth: client });
  const events = [];

  for (const session of sessions) {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: session.title || `Study: ${session.subject}`,
        description: [
          session.rationale,
          "",
          "Created by AI Weekly Study Planner POC.",
          `Draft session ID: ${session.id}`
        ].filter(Boolean).join("\n"),
        start: {
          dateTime: session.start,
          timeZone: session.timezone || "America/Sao_Paulo"
        },
        end: {
          dateTime: session.end,
          timeZone: session.timezone || "America/Sao_Paulo"
        },
        extendedProperties: {
          private: {
            app: "ai-weekly-study-planner-poc",
            draftSessionId: session.id
          }
        }
      }
    });

    events.push({
      ...session,
      status: "created",
      calendarEventId: response.data.id,
      htmlLink: response.data.htmlLink
    });
  }

  createdEvents.push(...events);
  return {
    mode: "google",
    events
  };
}

export function getConnectionStatus() {
  return {
    connected: Boolean(getAuthorizedClient()),
    configured: Boolean(getOAuthClient()),
    createdEvents
  };
}

function getAuthorizedClient() {
  const client = getOAuthClient();
  const tokens = tokenStore.get("demo-user");
  if (!client || !tokens) return null;

  client.setCredentials(tokens);
  return client;
}
