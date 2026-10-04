-- AI Creative Studio — initial schema.
-- Plain PostgreSQL (runs on PGlite locally and on Supabase/any Postgres later, unchanged).

-- ============ Accounts & workspaces ============
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null,
  locale text not null default 'ar',
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id),
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  primary key (workspace_id, user_id)
);

-- ============ Assets ============
create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid,
  kind text not null check (kind in ('image','video','audio','document','other')),
  source text not null check (source in ('upload','generated','export')),
  name text,
  mime_type text not null,
  byte_size bigint not null default 0,
  storage_key text not null,
  checksum text,
  width int,
  height int,
  duration_sec numeric,
  -- External provider ids are references only; the file itself is always copied into our storage.
  provider_ref jsonb,
  created_at timestamptz not null default now()
);
create index assets_workspace_idx on assets(workspace_id);
create index assets_project_idx on assets(project_id);
create index assets_checksum_idx on assets(workspace_id, checksum);

-- ============ Projects ============
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  start_type text not null,
  input_text text not null default '',
  language text not null default 'ar',
  platform_preset text not null,
  target_duration_sec int not null,
  style text not null default 'cinematic',
  status text not null default 'draft'
    check (status in ('draft','script_ready','storyboard_ready','approved','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table assets add constraint assets_project_fk
  foreign key (project_id) references projects(id) on delete set null;
create index projects_workspace_idx on projects(workspace_id, updated_at desc);

create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version int not null,
  note text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  title text not null,
  logline text not null default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','approved')),
  source_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Characters (data only in Phase 1) ============
create table characters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  -- age range, face, hair, skin tone, clothing, voice, dialect, personality, visual style...
  attributes jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table character_references (
  character_id uuid not null references characters(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  role text not null default 'reference',
  primary key (character_id, asset_id)
);

-- ============ Scenes & shots (storyboard) ============
create table scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position int not null,
  title text not null default '',
  description text not null default '',
  location text not null default '',
  characters_text text not null default '',
  narration text not null default '',
  dialogue text not null default '',
  camera text not null default '',
  lighting text not null default '',
  mood text not null default '',
  duration_sec numeric not null default 5,
  visual_prompt text not null default '',
  audio_notes text not null default '',
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  preview_asset_id uuid references assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scenes_project_idx on scenes(project_id, position);

create table scene_characters (
  scene_id uuid not null references scenes(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  primary key (scene_id, character_id)
);

create table shots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references scenes(id) on delete cascade,
  position int not null,
  description text not null default '',
  camera text not null default '',
  duration_sec numeric not null default 3
);
create index shots_scene_idx on shots(scene_id, position);

-- ============ Pronunciation dictionary (used by voice later) ============
create table pronunciation_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  term text not null,
  pronunciation text not null,
  language text not null default 'ar',
  unique (workspace_id, term, language)
);

-- ============ Generation jobs (Postgres job queue) ============
create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  type text not null,
  capability text not null,
  quality_tier text not null default 'draft'
    check (quality_tier in ('draft','standard','pro','cinematic')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  input jsonb not null,
  input_hash text not null,
  output jsonb,
  error text,
  provider text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_queue_idx on generation_jobs(status, run_after);
create index jobs_hash_idx on generation_jobs(workspace_id, type, input_hash);
create index jobs_project_idx on generation_jobs(project_id, created_at desc);

create table job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs(id) on delete cascade,
  attempt int not null,
  status text not null check (status in ('succeeded','failed')),
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

-- ============ Cost ledger ============
-- One row per provider call, mock or real. Mock calls cost 0 but are still logged.
create table provider_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  job_id uuid references generation_jobs(id) on delete set null,
  capability text not null,
  provider text not null,
  model text,
  is_mock boolean not null,
  units numeric not null,
  unit_type text not null,
  unit_price_usd numeric not null default 0,
  cost_usd numeric not null default 0,
  external_ref text,
  created_at timestamptz not null default now()
);
create index provider_calls_ws_idx on provider_calls(workspace_id, created_at desc);

-- Credits (commercial layer, inactive in Phase 1: no payments).
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delta numeric not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);
