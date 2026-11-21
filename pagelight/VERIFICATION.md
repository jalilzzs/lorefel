# PageLight — Deploy steps and verification report

## Deploy (in order)
1. Supabase SQL editor: run `supabase/schema.sql`, then `supabase/migrations/20261120_real_content_pipeline.sql` (additive, idempotent).
2. Railway web service env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_MODE=false`. NEVER put the service-role key in a `VITE_*` variable.
3. Railway worker service (same repo, root dir `pagelight`, start `node scripts/worker.mjs`, config `railway.json`):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_MODE=both`, `WORKER_BATCH=25`, `WORKER_SLEEP_MIN=15`. Restarts resume from `import_jobs.cursor`.
   (Alternative: GitHub Actions "Import real novel chapters" with secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.)
4. /admin → Imports tab: test sources, set rate limits, queue campaigns, watch live metrics (needs an admin profile).
5. Check: `select * from import_metrics;`

## Verified in this sandbox (facts)
- schema.sql + migration apply cleanly on PostgreSQL 16, twice (idempotent); schema.sql had a real bug (generated column) that is fixed.
- `import_work` / `import_comic` RPCs: import, duplicate-edition detection, empty rejection, page replacement on re-run, all tested in local Postgres.
- Ingest self-test (splitter incl. TOC guard, no fake chapter splits, normalizer, qualification, retry, rate limiter, MangaDex mapping) passes.
- Full app bundles in production mode; all 4 locales contain the new keys.

## NOT verified (sandbox has no access to external sites or your Supabase)
- No live call to Gutendex, Project Gutenberg, MangaDex or Supabase was executed. Imported counts today: **0 verified**. Do not trust any count until `import_metrics` shows it.
- Heading detection is heuristic; books without recognisable headings are stored as ONE honest section, so chapter counts will be lower than a naive split.
- MangaDex page URLs come from the at-home API and may need re-resolving later; only MangaDex-hosted, safe-rated, integer-numbered chapters are taken (first 5 per work by default).
- 10,000 qualified novels is the campaign TARGET, not a result. Gutenberg public-domain English/French fiction with plain text is large but may not reach 10k with strict qualification; Arabic/Chinese coverage there is small. The dashboard reports the true number.
- Still mock in production: library/recommender lookups by id read the procedural catalog (`catalog.byIds`, `related`), and the Title page chapter list uses generated names. Open Library/Archive/Wikisource/Standard Ebooks are registered as sources but have no adapters yet.

## Update 2026-11-21 (empty paragraphs fix)
Run `supabase/migrations/20261121_cleanup_and_batching.sql` in the Supabase SQL editor. It deletes legacy placeholder chapters and resets invented chapter counts.
Replace `.github/workflows/chapters-sync.yml` (the old one still called the deleted seed-chapters.mjs).
