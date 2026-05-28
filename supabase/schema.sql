create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encrypted_tokens text not null,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  deadline date not null,
  priority text not null default 'Medium',
  target_hours numeric not null default 2,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  start_hour integer not null default 8,
  end_hour integer not null default 21,
  session_length_minutes integer not null default 90,
  break_minutes integer not null default 15,
  weekly_target_hours numeric not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  source text not null default 'fallback',
  calendar_mode text not null default 'mock',
  generated_at timestamptz not null default now()
);

create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  draft_id text not null,
  subject text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  rationale text,
  priority text not null default 'Medium',
  confidence numeric not null default 0,
  status text not null default 'draft',
  timezone text,
  calendar_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_session_id uuid not null references public.plan_sessions(id) on delete cascade,
  google_event_id text not null,
  html_link text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.google_connections enable row level security;
alter table public.study_goals enable row level security;
alter table public.planner_preferences enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.calendar_events enable row level security;

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can read own goals" on public.study_goals
  for select using (auth.uid() = user_id);

create policy "Users can read own preferences" on public.planner_preferences
  for select using (auth.uid() = user_id);

create policy "Users can read own plans" on public.plans
  for select using (auth.uid() = user_id);

create policy "Users can read own plan sessions" on public.plan_sessions
  for select using (auth.uid() = user_id);

create policy "Users can read own calendar events" on public.calendar_events
  for select using (auth.uid() = user_id);

create index if not exists study_goals_user_deadline_idx on public.study_goals(user_id, deadline);
create index if not exists plans_user_generated_idx on public.plans(user_id, generated_at desc);
create index if not exists plan_sessions_plan_starts_idx on public.plan_sessions(plan_id, starts_at);
