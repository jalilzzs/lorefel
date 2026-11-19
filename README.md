# Loreleaf — novels, manhwa & manga reader

React + Vite + Supabase. Works immediately in **demo mode** (no keys needed): a deterministic 100,000-title catalog, local accounts, everything stored in your browser. Add Supabase keys and it switches to **live mode** automatically.

## Run
```bash
npm install
cp .env.example .env      # optional: leave empty for demo mode
npm run dev
```

## Go live with Supabase
1. Create a project, open **SQL Editor**, run `supabase/schema.sql` (tables, RLS, indexes, triggers, seed data).
2. Put the project URL and anon key in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Full 100k catalog: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed` (service key stays on your machine, never in the browser build).
4. Make yourself admin: `update profiles set role='admin' where id='<your uid>';`
5. Optional: `supabase functions deploy catalog-sync` and set `CATALOG_API_URL` to wire an external catalog.

## Admin
Open `/admin`, enter code **010203**. Set `VITE_ADMIN_REQUIRE_ROLE=true` to also require `profiles.role='admin'` (live mode). Note: the code is client-side only; real protection comes from the RLS policies, which only allow admins to write titles/news/settings.

## Keyboard shortcuts
`/` search · `T` quick settings · `Z` zen (reader) · `B` bookmark · `←/→` chapters or pages.

## Notes
- Demo-mode passwords are stored (base64) in localStorage — fine for a demo only.
- Chapter text and manga pages are generated placeholders; connect real content via the `chapters` table.
- Genre names are shown in English in all four languages; UI text is fully translated (`src/lib/i18n.js`).
- Dictionary lookup uses the public dictionaryapi.dev (English). Soundscapes are synthesized in the browser.
