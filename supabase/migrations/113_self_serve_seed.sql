-- Seed common consumer email providers so domain-match logic skips them.
INSERT INTO free_email_domains (domain) VALUES
  ('gmail.com'),
  ('yahoo.com'),('ymail.com'),('rocketmail.com'),
  ('outlook.com'),('hotmail.com'),('live.com'),('msn.com'),
  ('icloud.com'),('me.com'),('mac.com'),
  ('aol.com'),
  ('protonmail.com'),('proton.me'),('pm.me'),
  ('charter.net'),('comcast.net'),('att.net'),('verizon.net'),('sbcglobal.net'),
  ('pacbell.net'),('cox.net'),('earthlink.net'),
  ('mail.com'),('zoho.com'),('gmx.com'),('fastmail.com'),
  ('yahoo.co.uk'),('hotmail.co.uk'),('btinternet.com'),('rogers.com'),
  ('shaw.ca'),('telus.net')
ON CONFLICT (domain) DO NOTHING;

NOTIFY pgrst, 'reload schema';
