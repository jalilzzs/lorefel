# Pagelight ✦ — novels, manhwa & manga

React + Vite + Supabase reading platform with a 100,000-title catalog layer, four languages (AR · FR · EN · ZH, with RTL), four themes, a smart recommender, a full reader (novel, vertical strip, page-flip) and an admin portal.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

It works **immediately in demo mode** (no keys needed): accounts, library, progress, notes, news and admin edits are stored in `localStorage`, and the catalog is a deterministic, procedurally generated set of **100,000 titles** with generated covers and chapter text.

## Go live with Supabase

1. Create a project at supabase.com.
2. SQL Editor → run **`supabase/schema.sql`** (tables, RLS, indexes, triggers, realtime, avatar bucket, seed data + `seed_demo_catalog(n)`).
3. Copy `.env.example` → `.env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`. The app switches to live mode automatically (auth, synced progress, reviews, news, settings, realtime).
5. Make yourself admin: `update public.profiles set role = 'admin' where handle = 'your_handle';`
6. Optional: `select public.seed_demo_catalog(100000);` to stress-test with 100k rows, or deploy `supabase/functions/catalog-sync` (AniList importer) for real catalog data:
   `supabase functions deploy catalog-sync`.

If a live table is empty, the app falls back to the demo catalog / generated chapters so nothing looks broken.

## Admin portal

Open **`/admin`** (a tiny “·” link in the footer) and enter **`010203`** (`VITE_ADMIN_CODE`).
Set `VITE_ADMIN_REQUIRE_ROLE=true` to additionally require `profiles.role = 'admin'` in live mode.
> The code is a client-side gate. Real protection is Row Level Security: every admin write is only allowed for `role = 'admin'` accounts.

Dashboard: feature/module/theme/language toggles (applied to all visitors, realtime), 18+ presentation mode, user management (roles, age verification, suspend, delete), catalog (add/edit/delete titles & chapters, 18+ flags, connector tests for AniList/Jikan, import, simulated bulk sync, sync logs, health), news CRUD (4 languages), moderation queue and recommendation-weight tuning.

## Structure

```
src/lib        catalog (100k service), content generators, recommender, userdata store + Supabase sync,
               services (site settings, news, community, users, connectors), i18n, soundscape, cards
src/locales    en/fr/ar/zh (missing keys fall back to English, e.g. the admin portal)
src/components Layout (header, universal filter bar, quick settings), TitleCard/Shelf/QuickPeek, Reader tools, UI kit
src/pages      Home, Browse, Title, Reader, News, Auth, Profile, Discover tools, Admin
supabase/      schema.sql, functions/catalog-sync
```

## Feature map

Brand & logo (`public/logo-*.svg`), themes (Midnight Ink, Warm Paper, OLED, Daylight + 6 accents), universal genre/format/language bar on every page, instant search with autocomplete (title, author, tags, synopsis, format), age gating (birth date → blur/lock or hide, admin verify/reject), recommender ("For You", "Because you read…", "Rising in your genres", "High completion match"), bookmarks into 5 lists + custom collections, share/gift links and cards, progress auto-save with realtime cross-device sync, streaks & goals, highlights/notes/quotes/pins, spoiler shield, ratings/tag votes/reviews, related graph, offline chapter queue (IndexedDB), auto-scroll, TTS, analytics, follows & notifications, reading presets, vocabulary lookup, release calendar, per-chapter polls & discussion, JSON/CSV import-export, keyboard shortcuts (`/` `T` `B` `←→` `Z` `Space` `?`), skeletons/toasts, dynamic page titles — plus Quote Card Studio, ambient soundscapes (Web Audio), tension meter, character relationship map, lore atlas, quizzes, cinematic & zen modes, spin-the-wheel, reader persona, journey timeline, Pomodoro, compare, completion-time calculator, hidden gems, pointer-reactive covers, magazine view, finale alerts, version switcher, “previously on” recaps, badges, saved-moments archive, quick peek, archetype matcher.

## Notes

- Chapter content and covers are generated placeholders. Put real content in `chapters` (novels: `content`, comics: `pages` URLs) and `titles.cover_url`.
- Dictionary lookup uses the free dictionaryapi.dev (English); other languages link out to Wiktionary/Translate.
- Build with `npm run build`; deploy `dist/` anywhere (add an SPA fallback to `index.html`).
