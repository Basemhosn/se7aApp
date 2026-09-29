-- User preference: when on, the Home ring's daily kcal target is
-- increased by the day's active energy (steps burn) + cardio sessions
-- kcal_burned. Default off — conservative behavior matches onboarding.
alter table profiles
  add column add_cardio_to_target boolean not null default false;
