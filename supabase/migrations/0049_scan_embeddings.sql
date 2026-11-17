-- Scan dedupe cache — v0 (user-scoped only).
--
-- When a plate scan completes successfully we store a 64-bit perceptual
-- hash (pHash) of the image alongside the parsed result. On the next
-- scan we hash the uploaded image first, look up the user's own recent
-- scans by Hamming distance on that hash, and if a close match exists
-- we return the cached parse instantly instead of running the AI vision
-- call again.
--
-- v0 scope: user-scoped — a user's cache only matches their own past
-- scans. No cross-user sharing yet; that's gated on a privacy-policy
-- update and a separate confidence/quality model. Deferred to v1 along
-- with image-embedding upgrades.
--
-- Why pHash + not vector embeddings for v0: the primary v0 use case
-- is "I ate my morning oatmeal again" — same food, similar photo. pHash
-- handles that essentially for free (no AI call, no SDK dep). Vector
-- embeddings become worth their cost when we open cross-user matching,
-- which is v1.

alter table public.scans
  -- 64-bit perceptual hash stored as bigint so we can compute Hamming
  -- distance via bit_count(phash # candidate) directly in SQL.
  add column if not exists phash bigint;

-- Partial index on (user_id, created_at) for the "my recent scans with
-- a hash" lookup. The pHash comparison itself is a cheap sequential
-- scan on this narrow slice — we only ever look at the last ~50 scans
-- per user, so an actual pHash index would be overkill.
create index if not exists scans_user_phash_recent_idx
  on public.scans (user_id, created_at desc)
  where phash is not null and status = 'ready';
