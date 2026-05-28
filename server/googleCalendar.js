import { google } from "googleapis";
import { getMockBusyBlocks } from "./sampleData.js";
import { getGoogleConnection, recordCreatedEvents } from "./store.js";

export async function listBusyBlocks(userId, { timeMin, timeMax }) {
  const client = await getAuthorizedClient(userId);
  if (!client) {
    return {
      connected: false,
      busyBlocks: getMockBusyBlocks(),
      mode: "mock",
      reconnectRequired: false
    };
  }

  if (client.reconnectRequired) {
    return {
      connected: false,
      busyBlocks: getMockBusyBlocks(),
      mode: "needs_reconnect",
      reconnectRequired: true
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
    reconnectRequired: false,
    busyBlocks: busy.map((block, index) => ({
      id: `google-busy-${index}`,
      title: "Busy",
      start: block.start,
      end: block.end,
      source: "google"
    }))
  };
}

export async function createStudyEvents(userId, sessions) {
  const client = await getAuthorizedClient(userId);
  if (!client) {
    const saved = sessions.map((session) => ({
      ...session,
      status: "created",
      calendarEventId: `mock-event-${crypto.randomUUID()}`,
      htmlLink: null
    }));
    await recordCreatedEvents(userId, saved);
    return {
      mode: "mock",
      events: saved
    };
  }

  if (client.reconnectRequired) {
    const error = new Error("Google Calendar needs to be reconnected before events can be created.");
    error.status = 409;
    throw error;
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

  await recordCreatedEvents(userId, events);
  return {
    mode: "google",
    events
  };
}

export async function getCalendarStatus(userId) {
  const connection = await getGoogleConnection(userId);
  const expired = isExpired(connection?.expiresAt);
  return {
    connected: connection?.status === "connected" && !expired,
    reconnectRequired: connection?.status === "needs_reconnect" || expired,
    scopes: connection?.scopes || []
  };
}

async function getAuthorizedClient(userId) {
  const connection = await getGoogleConnection(userId);
  if (!connection) return null;
  if (connection.status === "needs_reconnect" || !connection.tokens?.providerToken || isExpired(connection.expiresAt)) {
    return { reconnectRequired: true };
  }

  const client = new google.auth.OAuth2();
  client.setCredentials({
    access_token: connection.tokens.providerToken,
    refresh_token: connection.tokens.providerRefreshToken,
    expiry_date: connection.expiresAt ? new Date(connection.expiresAt).getTime() : undefined
  });

  return client;
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now() + 60_000;
}
