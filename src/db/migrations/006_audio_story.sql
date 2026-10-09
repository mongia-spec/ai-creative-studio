-- Audio-to-video: a narrator recording becomes timed shots. Each shot can use a ready video clip
-- (instead of generating one), its analysis is kept on the project, and every shot records
-- where its picture comes from so mock/placeholder visuals are never presented as real.
alter table scenes add column video_asset_id uuid references assets(id) on delete set null;
alter table scenes add column video_start numeric not null default 0 check (video_start >= 0);
alter table scenes add column visual_source text check (visual_source in ('clip','image','character','placeholder'));
alter table scenes add column motion_prompt text not null default '';
alter table projects add column story jsonb;
