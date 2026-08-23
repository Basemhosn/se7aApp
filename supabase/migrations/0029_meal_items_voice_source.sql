-- SE7A: allow "voice" as a meal_items source.
-- Run after 0028_micronutrients.sql.
--
-- Voice log currently lands rows with source='manual' because the
-- meal_items check constraint predates the voice-log feature. Splitting
-- them out lets pattern detectors + top-foods queries distinguish
-- voice-entered items from typed-in manual ones — small signal, but
-- worth having since the two behaviors are meaningfully different
-- (voice = probably rushed / vague portions, manual = deliberate).

alter table public.meal_items
  drop constraint if exists meal_items_source_check;

alter table public.meal_items
  add constraint meal_items_source_check
  check (source in ('plate_scan','menu_scan','manual','barcode','voice'));
