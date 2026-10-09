-- Production: scene motion, scene reference image, per-scene audio, project music.
alter table scenes add column motion text not null default 'none'
  check (motion in ('none','zoom_in','zoom_out','pan_left','pan_right'));
alter table scenes add column reference_asset_id uuid references assets(id) on delete set null;
alter table scenes add column audio_asset_id uuid references assets(id) on delete set null;
alter table projects add column music_asset_id uuid references assets(id) on delete set null;
alter table projects add column music_volume numeric not null default 0.25 check (music_volume between 0 and 1);

-- Brand kit (one per workspace): applied to exports as watermark and end card.
create table brand_kits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  name text not null default '',
  primary_color text not null default '#0e8a8a',
  text_color text not null default '#ffffff',
  logo_asset_id uuid references assets(id) on delete set null,
  watermark text not null default '',
  cta text not null default '',
  updated_at timestamptz not null default now()
);

-- Interactive video: creator settings + timed questions / hotspots / branches.
alter table projects add column interactive jsonb not null default '{}'::jsonb;
create table interactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  at_sec numeric not null default 0,
  kind text not null check (kind in ('question','hotspot','branch')),
  prompt text not null,
  -- [{label, correct?, gotoPosition?, feedback?}]
  choices jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index interactions_project_idx on interactions(project_id, scene_id, at_sec);

-- Viewer answers (analytics for the creator).
create table interaction_responses (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions(id) on delete cascade,
  choice_index int not null,
  correct boolean,
  created_at timestamptz not null default now()
)
