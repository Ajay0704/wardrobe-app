-- AJA-16: calendar column for wear-log / Calendar sync (web <-> app)
alter table public.wardrobe_snapshots
  add column if not exists calendar jsonb not null default '[]'::jsonb;
