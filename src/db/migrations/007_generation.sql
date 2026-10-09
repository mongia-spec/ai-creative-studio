-- General generation pipeline (any project type): kind, visual quality, spending cap and the
-- approval of a priced plan. Generated pictures/clips are labelled by origin.
alter table projects add column kind text not null default 'story' check (kind in ('story','film','ad','social','educational'));
alter table projects add column quality text not null default 'draft' check (quality in ('draft','standard'));
alter table projects add column spend_cap_usd numeric not null default 0 check (spend_cap_usd >= 0);
alter table projects add column generation_approval jsonb;
alter table scenes drop constraint if exists scenes_visual_source_check;
alter table scenes add constraint scenes_visual_source_check
  check (visual_source in ('clip','image','character','placeholder','ai_image','ai_video'));
