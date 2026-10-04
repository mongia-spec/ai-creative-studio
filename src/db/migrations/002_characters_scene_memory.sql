-- Phase 2: characters linked to scenes, and scene memory (continuity carried across scenes).

-- What changes for a character starting in this scene (e.g. {"wardrobe": "معطف أحمر"}).
-- Later scenes inherit it until another scene changes it.
alter table scene_characters add column state jsonb not null default '{}'::jsonb;
alter table scene_characters add column created_at timestamptz not null default now();

alter table scenes add column time_of_day text not null default '';

-- Which reference image is the main face/identity image for a character.
alter table character_references add column created_at timestamptz not null default now();

create index characters_workspace_idx on characters(workspace_id, name);
create index scene_characters_character_idx on scene_characters(character_id)
