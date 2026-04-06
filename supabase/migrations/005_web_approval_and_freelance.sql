-- Add web_approved flag to stories (approval gate before publishing)
alter table stories add column if not exists web_approved boolean default false;

-- Add freelance and specialty columns to team_members
alter table team_members add column if not exists is_freelance boolean default false;
alter table team_members add column if not exists specialty text;

-- Index for quick freelancer lookups
create index if not exists idx_team_members_freelance on team_members (is_freelance) where is_freelance = true;
