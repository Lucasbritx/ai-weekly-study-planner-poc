# AI Weekly Study Planner POC

A full-stack proof of concept for planning a student's study week around Google Calendar availability.

## What It Does

- Reads the user's next-week availability from Google Calendar when OAuth is configured.
- Falls back to mock busy blocks so the POC is usable immediately.
- Generates editable study sessions from subjects, deadlines, priorities, and preferences.
- Uses `@openai/codex-sdk` server-side when `USE_CODEX_SDK=true`; otherwise uses a deterministic local planner fallback.
- Creates Google Calendar events only after the user selects and approves draft sessions.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Google Calendar Setup

Create OAuth credentials in Google Cloud, enable the Google Calendar API, then set:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
CLIENT_BASE_URL=http://localhost:5173
```

The POC requests availability and event creation scopes. It does not delete or reschedule existing calendar events.

## Codex SDK Setup

Install dependencies and set:

```bash
USE_CODEX_SDK=true
```

The server imports `Codex` from `@openai/codex-sdk`, starts a thread, asks for strict JSON, validates the response, and falls back to the local planner if the SDK call fails.
