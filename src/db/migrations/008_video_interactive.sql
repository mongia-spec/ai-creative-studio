-- Interactive lesson over a finished video: the video plays as is; the player pauses it for
-- questions (spoken answers recorded by students) and for questions asked to the character.
alter table projects add column source_video_asset_id uuid references assets(id) on delete set null;

alter table interactions drop constraint if exists interactions_kind_check;
alter table interactions add constraint interactions_kind_check check (kind in ('question','hotspot','branch','voice'));
-- Optional recording of the question (the teacher, or the character's voice actor).
alter table interactions add column prompt_audio_asset_id uuid references assets(id) on delete set null;

-- A spoken answer: the student's recording, kept for the teacher to listen to.
alter table interaction_responses add column audio_asset_id uuid references assets(id) on delete set null;
