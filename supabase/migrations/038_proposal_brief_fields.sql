-- Campaign brief fields on proposals — flows to ad_projects on conversion
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS brief_headline text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS brief_style text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS brief_colors text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS brief_instructions text;
