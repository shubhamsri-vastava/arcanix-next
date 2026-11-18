-- Initial catalog needed by player_details.primary_game_id and player_skills.
-- Review and apply only through the approved development-project migration process.
insert into public.games(slug, name) values
  ('valorant', 'VALORANT'),
  ('bgmi', 'BGMI'),
  ('counter-strike-2', 'Counter-Strike 2'),
  ('apex-legends', 'Apex Legends'),
  ('rocket-league', 'Rocket League'),
  ('league-of-legends', 'League of Legends'),
  ('dota-2', 'Dota 2'),
  ('overwatch-2', 'Overwatch 2'),
  ('rainbow-six-siege', 'Rainbow Six Siege'),
  ('call-of-duty-warzone', 'Call of Duty: Warzone')
on conflict (slug) do update set name = excluded.name, is_active = true;
