# AI Weekly Study Planner POC

A full-stack proof of concept for planning a student's study week around Google Calendar availability.

## What It Does

- Signs users in with Google through Supabase Auth.
- Reads the user's next-week availability from Google Calendar when provider tokens are available.
- Falls back to mock busy blocks so the POC is usable immediately.
- Generates editable study sessions from subjects, deadlines, priorities, and preferences.
- Uses `@openai/codex-sdk` server-side when `USE_CODEX_SDK=true`; otherwise uses a deterministic local planner fallback.
- Persists profiles, Google connections, goals, preferences, plans, sessions, and created event IDs in Supabase.
- Creates Google Calendar events only after the user selects and approves draft sessions.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Supabase Setup

1. Create a Supabase project.
2. Run the database schema from [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
3. Enable the Google Auth provider in Supabase.
4. In Google Cloud, enable Google Calendar API and configure the OAuth consent screen.
5. Add the Supabase Google callback URL from the Supabase dashboard to the Google OAuth client.
6. Set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENCRYPTION_KEY=...
```

The schema SQL is kept in [`supabase/schema.sql`](supabase/schema.sql) instead of being embedded here because it creates all planner tables, RLS policies, and indexes. It includes:

- `profiles`
- `google_connections`
- `study_goals`
- `planner_preferences`
- `plans`
- `plan_sessions`
- `calendar_events`

The frontend uses Supabase only for login/session. The Express backend verifies the Supabase JWT and performs all database writes with the service role key. Google provider tokens are encrypted before storage.

If Supabase env vars are missing, the app runs in local demo mode with in-memory persistence.

## Google Calendar Scopes

The Google sign-in requests:

- `https://www.googleapis.com/auth/calendar.freebusy`
- `https://www.googleapis.com/auth/calendar.events`

The POC reads availability and creates approved study events. It does not delete or reschedule existing calendar events.

## Codex SDK Setup

Install dependencies and set:

```bash
USE_CODEX_SDK=true
```

The server imports `Codex` from `@openai/codex-sdk`, starts a thread, asks for strict JSON, validates the response, and falls back to the local planner if the SDK call fails.
