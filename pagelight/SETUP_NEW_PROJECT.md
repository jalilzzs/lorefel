# Setup on the NEW Supabase project (metadata only — no chapter text is stored)

1. Supabase → SQL Editor → paste ALL of `supabase/NEW_PROJECT.sql` → Run. (Do NOT run the old files in supabase/migrations.)
2. Railway (worker service):
   - Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (new project), IMPORTER_CONTACT (your e-mail)
   - Settings → Networking → Generate Domain  → this is the reader API address (e.g. https://pagelight-worker.up.railway.app)
3. Railway (website service): add variable `VITE_READER_API` = that address (no trailing slash) → redeploy the website.
4. Check: open `<reader address>/health` → {"ok":true,...}
5. Disk guard: the worker pauses importing at DISK_LIMIT_MB (default 400 MB of the 500 MB free plan).
