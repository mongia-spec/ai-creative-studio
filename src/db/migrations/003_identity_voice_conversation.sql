-- Identity Lock, Voice Identity Lock, outfits, knowledge base, conversations and answer cache.

-- Reference roles: primary (main identity image), face, outfit, pose, reference (other).
update character_references set role='reference' where role not in ('primary','face','outfit','pose','reference');
alter table character_references add constraint character_references_role_chk
  check (role in ('primary','face','outfit','pose','reference'));
create unique index character_references_one_primary on character_references(character_id) where role='primary';

-- Voice Identity Lock: one saved voice profile per character, reused in every scene and answer.
create table character_voices (
  character_id uuid primary key references characters(id) on delete cascade,
  provider text not null default 'mock-voice',
  voice_id text not null default '',
  language text not null default 'ar',
  dialect text not null default '',
  tone text not null default '',
  speed numeric not null default 1 check (speed >= 0.5 and speed <= 2),
  pitch numeric not null default 0 check (pitch >= -12 and pitch <= 12),
  style text not null default '',
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into character_voices(character_id, language, dialect)
  select id, coalesce(nullif(attributes->>'language',''),'ar'), coalesce(attributes->>'dialect','') from characters;

-- Saved outfits. A scene can pin an outfit; it carries forward like other scene memory.
create table character_outfits (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  name text not null,
  description text not null default '',
  asset_id uuid references assets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (character_id, name)
);
alter table scene_characters add column outfit_id uuid references character_outfits(id) on delete set null;

-- Character knowledge base (optionally scoped to one project/lesson).
create table character_knowledge (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index character_knowledge_char_idx on character_knowledge(character_id);

-- Conversations with a character (test mode or inside the interactive player).
create table conversations (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  channel text not null check (channel in ('test','player')),
  created_at timestamptz not null default now()
);
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','character')),
  text text not null,
  tier text check (tier in ('text','voice','avatar')),
  in_scope boolean,
  cached boolean not null default false,
  source_ids uuid[] not null default '{}',
  audio_asset_id uuid references assets(id) on delete set null,
  video_asset_id uuid references assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index conversation_messages_conv_idx on conversation_messages(conversation_id, created_at);

-- Cache of text answers: same character + same knowledge version + same (normalized) question.
create table answer_cache (
  character_id uuid not null references characters(id) on delete cascade,
  cache_key text not null,
  answer text not null,
  in_scope boolean not null,
  source_ids uuid[] not null default '{}',
  hits int not null default 0,
  created_at timestamptz not null default now(),
  primary key (character_id, cache_key)
)
