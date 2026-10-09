-- Real voice recordings and uploads: rights/consent per audio file, character voice sample,
-- and per-scene audio placement (offset) and trim on the timeline.
alter table assets add column rights jsonb;
alter table characters add column voice_sample_asset_id uuid references assets(id) on delete set null;
alter table scenes add column audio_offset_sec numeric not null default 0 check (audio_offset_sec >= 0);
alter table scenes add column audio_trim_start numeric not null default 0 check (audio_trim_start >= 0);
alter table scenes add column audio_trim_end numeric check (audio_trim_end is null or audio_trim_end > audio_trim_start);
