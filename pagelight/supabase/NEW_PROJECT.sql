-- =====================================================================
--  Pagelight — Supabase schema, RLS, indexes and seed data
--  Run this whole file once in: Supabase Dashboard → SQL Editor → New query
--  Safe to re-run (idempotent where practical).
-- =====================================================================

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  handle              text unique,
  display_name        text,
  avatar_url          text,
  ui_lang             text not null default 'en' check (ui_lang in ('en','fr','ar','zh')),
  content_langs       text[] not null default '{en}',
  birth_date          date,
  age_status          text not null default 'unverified' check (age_status in ('unverified','verified','rejected')),
  favorite_genres     text[] not null default '{}',
  muted_tags          text[] not null default '{}',
  daily_goal_minutes  int  not null default 20 check (daily_goal_minutes between 1 and 600),
  weekly_goal_chapters int not null default 20 check (weekly_goal_chapters between 1 and 1000),
  theme               text not null default 'midnight',
  accent              text not null default 'violet',
  role                text not null default 'user' check (role in ('user','moderator','admin')),
  suspended           boolean not null default false,
  created_at          timestamptz not null default now()
);

-- helper functions (security definer so they can be used inside RLS policies)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not suspended);
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator') and not suspended);
$$;

-- Age gate: verified by an admin, OR birth date says 18+ (and not rejected)
create or replace function public.is_adult() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.age_status <> 'rejected'
      and (p.age_status = 'verified'
           or (p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')))
  );
$$;

-- Create a profile automatically on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, handle, ui_lang, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || substr(new.id::text, 1, 4),
    coalesce(nullif(new.raw_user_meta_data->>'ui_lang',''), 'en'),
    nullif(new.raw_user_meta_data->>'birth_date','')::date
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins cannot change their own role / age verification / suspension
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.age_status := case when new.birth_date is distinct from old.birth_date then 'unverified' else old.age_status end;
    if old.age_status = 'rejected' then new.age_status := 'rejected'; end if;
    new.suspended := old.suspended;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Public-safe view (no birth date / role / etc.)
create or replace view public.public_profiles as
  select id, handle, display_name, avatar_url from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. CATALOG: titles + chapters
-- ---------------------------------------------------------------------
-- array_to_string is STABLE, which Postgres rejects in generated columns; wrap it.
create or replace function public.immutable_join(a text[]) returns text
language sql immutable parallel safe as $$ select array_to_string(a, ' ') $$;

create table if not exists public.titles (
  id                bigint generated always as identity primary key,
  external_source   text,            -- e.g. 'anilist', 'mangadex', 'jikan'
  external_id       text,
  title             text not null,
  author            text,
  translator        text,
  format            text not null check (format in ('novel','manhwa','manga')),
  status            text not null default 'ongoing' check (status in ('ongoing','completed','hiatus')),
  year              int,
  rating            numeric(3,2) not null default 0,
  rating_count      int not null default 0,
  user_rating_avg   numeric(3,2),
  user_rating_count int not null default 0,
  chapter_count     int not null default 0,
  language          text not null default 'en' check (language in ('en','fr','ar','zh')),
  origin            text,
  genres            text[] not null default '{}',
  tags              text[] not null default '{}',
  synopsis          text,
  cover_url         text,
  is_mature         boolean not null default false,
  velocity          numeric(5,2) not null default 0,   -- trending velocity score 0..100
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  search_vector     tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(author,'') || ' ' || coalesce(synopsis,'') || ' ' || coalesce(public.immutable_join(tags),''))
  ) stored,
  unique (external_source, external_id)
);

create table if not exists public.chapters (
  id            bigint generated always as identity primary key,
  title_id      bigint not null references public.titles(id) on delete cascade,
  number        int not null,
  name          text,
  version       text not null default 'official',      -- translation / version stream
  content       text,                                   -- novels: paragraphs separated by blank lines
  pages         text[],                                 -- manhwa/manga: image URLs in reading order
  published_at  timestamptz not null default now(),
  unique (title_id, number, version)
);

-- Performance indexes for 100k+ catalogs
create index if not exists titles_format_status_idx on public.titles (format, status);
create index if not exists titles_genres_gin        on public.titles using gin (genres);
create index if not exists titles_tags_gin          on public.titles using gin (tags);
create index if not exists titles_search_gin        on public.titles using gin (search_vector);
create index if not exists titles_title_trgm        on public.titles using gin (title gin_trgm_ops);
create index if not exists titles_author_trgm       on public.titles using gin (author gin_trgm_ops);
create index if not exists titles_rating_idx        on public.titles (rating desc, rating_count desc);
create index if not exists titles_velocity_idx      on public.titles (velocity desc);
create index if not exists titles_updated_idx       on public.titles (updated_at desc);
create index if not exists titles_year_idx          on public.titles (year desc);
create index if not exists titles_lang_idx          on public.titles (language);
create index if not exists titles_mature_idx        on public.titles (is_mature) where is_mature;
create index if not exists chapters_title_num_idx   on public.chapters (title_id, number);

-- ---------------------------------------------------------------------
-- 3. USER DATA
-- ---------------------------------------------------------------------
create table if not exists public.user_library (
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_id   bigint not null,
  status     text not null check (status in ('reading','plan','completed','hold','dropped')),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.reading_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  title_id     bigint not null,
  chapter      int not null default 1,
  position     numeric(6,5) not null default 0,       -- 0..1 scroll / page position
  max_chapter  int not null default 1,
  seconds_read int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.highlights_notes (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_id   bigint not null,
  chapter    int not null,
  kind       text not null check (kind in ('highlight','note','pin','quote')),
  para       int,
  start_off  int,
  end_off    int,
  text       text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists highlights_user_idx on public.highlights_notes (user_id, title_id);

create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_id   bigint not null,
  rating     numeric(2,1) not null check (rating between 0.5 and 5),
  body       text,
  pros       text,
  cons       text,
  spoiler    boolean not null default false,
  status     text not null default 'visible' check (status in ('visible','hidden','flagged')),
  created_at timestamptz not null default now(),
  unique (user_id, title_id)
);
create index if not exists reviews_title_idx on public.reviews (title_id, created_at desc);

create table if not exists public.tag_votes (
  user_id  uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null,
  tag      text not null,
  primary key (user_id, title_id, tag)
);

create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null check (kind in ('author','translator','series')),
  name    text not null,
  primary key (user_id, kind, name)
);

create table if not exists public.collections (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  items       bigint[] not null default '{}',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.reading_streaks (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_read_date date,
  days           jsonb not null default '{}'::jsonb,   -- { "2026-01-31": {"seconds": 1200, "chapters": 3} }
  goal_minutes   int not null default 20,
  updated_at     timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id     uuid not null references auth.users(id) on delete cascade,
  badge       text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge)
);

-- ---------------------------------------------------------------------
-- 4. COMMUNITY: per-chapter discussions & polls
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_id   bigint not null,
  chapter    int not null,
  body       text not null check (char_length(body) between 1 and 2000),
  spoiler    boolean not null default false,
  parent_id  uuid references public.comments(id) on delete cascade,
  status     text not null default 'visible' check (status in ('visible','hidden','flagged')),
  created_at timestamptz not null default now()
);
create index if not exists comments_thread_idx on public.comments (title_id, chapter, created_at desc);

create table if not exists public.chapter_polls (
  id         uuid primary key default gen_random_uuid(),
  title_id   bigint not null,
  chapter    int not null,
  question   text not null,
  options    jsonb not null,                         -- ["Option A", "Option B", ...]
  created_at timestamptz not null default now(),
  unique (title_id, chapter)
);

create table if not exists public.chapter_poll_votes (
  poll_id    uuid not null references public.chapter_polls(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  option_idx int not null,
  primary key (poll_id, user_id)
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('review','comment','title','user')),
  target_id   text not null,
  reason      text,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. EDITORIAL & ADMIN
-- ---------------------------------------------------------------------
create table if not exists public.news_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  title       jsonb not null,                        -- { "en": "...", "fr": "...", "ar": "...", "zh": "..." }
  excerpt     jsonb not null default '{}'::jsonb,
  body        jsonb not null default '{}'::jsonb,
  category    text not null default 'news',          -- news | adaptation | schedule | spotlight | platform
  genres      text[] not null default '{}',
  hue         int not null default 260,
  event_date  date,                                  -- shows up in the release calendar
  author      text,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists news_published_idx on public.news_posts (published, created_at desc);

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_sync_logs (
  id          bigint generated always as identity primary key,
  source      text not null,
  status      text not null check (status in ('running','success','partial','failed')),
  imported    int not null default 0,
  updated     int not null default 0,
  failed      int not null default 0,
  message     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.titles             enable row level security;
alter table public.chapters           enable row level security;
alter table public.user_library       enable row level security;
alter table public.reading_progress   enable row level security;
alter table public.highlights_notes   enable row level security;
alter table public.reviews            enable row level security;
alter table public.tag_votes          enable row level security;
alter table public.follows            enable row level security;
alter table public.collections        enable row level security;
alter table public.reading_streaks    enable row level security;
alter table public.user_badges        enable row level security;
alter table public.comments           enable row level security;
alter table public.chapter_polls      enable row level security;
alter table public.chapter_poll_votes enable row level security;
alter table public.reports            enable row level security;
alter table public.news_posts         enable row level security;
alter table public.site_settings      enable row level security;
alter table public.catalog_sync_logs  enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete using (public.is_admin());

-- titles (public read, admin write)
drop policy if exists titles_read on public.titles;
create policy titles_read on public.titles for select using (true);
drop policy if exists titles_admin_write on public.titles;
create policy titles_admin_write on public.titles for all using (public.is_admin()) with check (public.is_admin());

-- chapters (public read; 18+ content only for adults / admins)
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters for select using (
  public.is_admin()
  or not exists (select 1 from public.titles t where t.id = chapters.title_id and t.is_mature)
  or public.is_adult()
);
drop policy if exists chapters_admin_write on public.chapters;
create policy chapters_admin_write on public.chapters for all using (public.is_admin()) with check (public.is_admin());

-- "own rows" tables
do $$
declare t text;
begin
  foreach t in array array['user_library','reading_progress','highlights_notes','tag_votes','follows','collections','reading_streaks','user_badges']
  loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format('create policy %I_own on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('drop policy if exists %I_admin_read on public.%I', t, t);
    execute format('create policy %I_admin_read on public.%I for select using (public.is_admin())', t, t);
  end loop;
end $$;

-- public collections are readable by everyone
drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections for select using (is_public);

-- reviews: public read of visible ones, authors manage their own, moderators manage all
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (status = 'visible' or user_id = auth.uid() or public.is_moderator());
drop policy if exists reviews_write on public.reviews;
create policy reviews_write on public.reviews for insert with check (user_id = auth.uid());
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews for update using (user_id = auth.uid() or public.is_moderator());
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete using (user_id = auth.uid() or public.is_moderator());

-- comments: same pattern
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (status = 'visible' or user_id = auth.uid() or public.is_moderator());
drop policy if exists comments_write on public.comments;
create policy comments_write on public.comments for insert with check (user_id = auth.uid());
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update using (user_id = auth.uid() or public.is_moderator());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete using (user_id = auth.uid() or public.is_moderator());

-- polls
drop policy if exists polls_read on public.chapter_polls;
create policy polls_read on public.chapter_polls for select using (true);
drop policy if exists polls_write on public.chapter_polls;
create policy polls_write on public.chapter_polls for insert with check (auth.uid() is not null);
drop policy if exists polls_admin on public.chapter_polls;
create policy polls_admin on public.chapter_polls for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists poll_votes_read on public.chapter_poll_votes;
create policy poll_votes_read on public.chapter_poll_votes for select using (true);
drop policy if exists poll_votes_write on public.chapter_poll_votes;
create policy poll_votes_write on public.chapter_poll_votes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
drop policy if exists reports_mod on public.reports;
create policy reports_mod on public.reports for all using (public.is_moderator()) with check (public.is_moderator());

-- news
drop policy if exists news_read on public.news_posts;
create policy news_read on public.news_posts for select using (published or public.is_admin());
drop policy if exists news_admin on public.news_posts;
create policy news_admin on public.news_posts for all using (public.is_admin()) with check (public.is_admin());

-- site settings (public read so feature toggles apply to everyone; admin write)
drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select using (true);
drop policy if exists settings_admin on public.site_settings;
create policy settings_admin on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

-- sync logs
drop policy if exists sync_logs_admin on public.catalog_sync_logs;
create policy sync_logs_admin on public.catalog_sync_logs for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 7. AGGREGATES & REALTIME
-- ---------------------------------------------------------------------
create or replace function public.refresh_title_user_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid bigint;
begin
  tid := coalesce(new.title_id, old.title_id);
  update public.titles t set
    user_rating_avg = (select round(avg(rating)::numeric, 2) from public.reviews r where r.title_id = tid and r.status = 'visible'),
    user_rating_count = (select count(*) from public.reviews r where r.title_id = tid and r.status = 'visible')
  where t.id = tid;
  return null;
end $$;

drop trigger if exists reviews_rating_refresh on public.reviews;
create trigger reviews_rating_refresh after insert or update or delete on public.reviews
  for each row execute function public.refresh_title_user_rating();

-- Realtime: cross-device progress sync, live news and live discussions
do $$
begin
  begin alter publication supabase_realtime add table public.reading_progress; exception when others then null; end;
  begin alter publication supabase_realtime add table public.news_posts;       exception when others then null; end;
  begin alter publication supabase_realtime add table public.comments;         exception when others then null; end;
  begin alter publication supabase_realtime add table public.site_settings;    exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 8. STORAGE (avatars)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars own write" on storage.objects;
create policy "avatars own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 9. SEED DATA
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
('global', '{
  "features": {"novels": true, "manhwa": true, "manga": true, "news": true, "tts": true, "recommendations": true, "gating18": true,
               "soundscapes": true, "quotes": true, "social": true, "calendar": true},
  "matureMode": "blur",
  "disabledThemes": [],
  "disabledLangs": [],
  "recWeights": {"genre": 1.0, "format": 0.6, "rating": 0.5, "velocity": 0.35, "tag": 0.4, "completion": 0.5}
}'::jsonb)
on conflict (key) do nothing;

insert into public.news_posts (slug, title, excerpt, category, genres, hue, event_date, author) values
('welcome-to-pagelight',
 '{"en":"Welcome to Pagelight","fr":"Bienvenue sur Pagelight","ar":"مرحبًا بكم في بيج لايت","zh":"欢迎来到 Pagelight"}',
 '{"en":"A new reading home for novels, manhwa and manga in four languages."}', 'platform', '{}', 265, null, 'Pagelight Team'),
('season-finale-approaches',
 '{"en":"Season finales to watch this month","fr":"Les finales de saison à suivre ce mois-ci","ar":"نهايات المواسم التي يجب متابعتها هذا الشهر","zh":"本月值得关注的季终章"}',
 '{"en":"Three long-running series are closing their current arcs within weeks."}', 'spotlight', '{fantasy,action}', 330, current_date + 6, 'Editorial'),
('adaptation-announced',
 '{"en":"Wuxia epic announced for animation","fr":"Une épopée wuxia annoncée en animation","ar":"الإعلان عن اقتباس ملحمة ووشيا","zh":"武侠史诗宣布动画化"}',
 '{"en":"Studio announces a 24-episode adaptation of a fan-favourite wuxia novel."}', 'adaptation', '{wuxia,xianxia}', 20, current_date + 14, 'Editorial'),
('translation-complete',
 '{"en":"Translation complete: a cult mystery reaches its final chapter","fr":"Traduction terminée : un mystère culte atteint son dernier chapitre","ar":"اكتملت الترجمة: رواية غموض شهيرة تصل إلى فصلها الأخير","zh":"翻译完结：一部经典悬疑迎来最终章"}',
 '{"en":"After four years the community translation team has delivered the last chapter."}', 'news', '{mystery,thriller}', 200, null, 'Community Desk'),
('release-schedule-spring',
 '{"en":"Release schedule update","fr":"Mise à jour du calendrier de sorties","ar":"تحديث جدول الإصدارات","zh":"更新计划调整"}',
 '{"en":"Weekly drops move to a Friday-first rhythm for most manhwa series."}', 'schedule', '{}', 150, current_date + 3, 'Platform')
on conflict (slug) do nothing;

-- Demo catalog generator. Call with up to 100000 to stress-test the catalog layer:
--   select public.seed_demo_catalog(100000);
create or replace function public.seed_demo_catalog(n int default 2000) returns int
language plpgsql security definer set search_path = public as $$
declare
  g_all text[] := array['action','fantasy','romance','thriller','mystery','scifi','historical','sliceoflife','horror','drama','wuxia','xianxia','litrpg','psychological','comedy','sports','supernatural','isekai','adventure','school','mecha','tragedy'];
  adj text[] := array['Crimson','Hollow','Silent','Ember','Iron','Pale','Gilded','Wandering','Veiled','Last','Midnight','Radiant','Forsaken','Sable','Verdant','Obsidian'];
  noun text[] := array['Throne','Oath','Garden','Blade','Archive','Tide','Lantern','Crown','Covenant','Cipher','Orchard','Citadel','Requiem','Compass','Eclipse','Harbor'];
  inserted int;
begin
  insert into public.titles (title, author, format, status, year, rating, rating_count, chapter_count, language, origin, genres, tags, synopsis, is_mature, velocity, updated_at)
  select
    adj[1 + floor(random()*16)::int] || ' ' || noun[1 + floor(random()*16)::int] || ' ' || (g % 997),
    (array['Han Seo-jun','Aoi Tachibana','Liang Wei','Layla Haddad','Mireille Dorsay','Marcus Vale','Sora Minami','Yara Nasser'])[1 + floor(random()*8)::int],
    (array['novel','manhwa','manga'])[1 + floor(random()*3)::int],
    (array['ongoing','ongoing','completed','hiatus'])[1 + floor(random()*4)::int],
    2005 + floor(random()*22)::int,
    round((3.2 + random()*1.7)::numeric, 2),
    floor(power(10, 1.5 + random()*3.5))::int,
    5 + floor(power(10, 0.8 + random()*2.4))::int,
    (array['en','en','en','fr','ar','zh'])[1 + floor(random()*6)::int],
    (array['KR','JP','CN','US','FR'])[1 + floor(random()*5)::int],
    array(select distinct x from unnest(array[g_all[1+floor(random()*22)::int], g_all[1+floor(random()*22)::int], g_all[1+floor(random()*22)::int]]) x),
    array(select distinct x from unnest(array[(array['violence','reincarnation','revenge','slow-burn','found-family','magic-academy','time-travel','politics'])[1+floor(random()*8)::int], (array['overpowered-mc','villainess','dungeon','war','cultivation','profanity','gore','nudity'])[1+floor(random()*8)::int]]) x),
    'A seeded demo story. Replace with real catalog data through the admin ingestion tools.',
    random() < 0.08,
    round((power(random(), 2.2) * 100)::numeric, 2),
    now() - (random() * 90 || ' days')::interval
  from generate_series(1, n) g;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Seed 2,000 demo titles by default (only if the table is empty). Raise the number to test 100k+.
do $$ begin
  if (select count(*) from public.titles) = 0 then
    perform public.seed_demo_catalog(2000);
  end if;
end $$;

-- To make yourself an admin after signing up:
--   update public.profiles set role = 'admin' where handle = 'your_handle';
-- =====================================================================
-- PageLight — content pipeline v2 ("metadata only"): NO chapter text and NO page images are stored.
-- The database keeps only: works, titles, chapter LIST (number, name, word count, source reference), import bookkeeping.
-- Chapter text / pages are fetched from the original source at reading time by the reader API (scripts/reader-api.mjs).
-- =====================================================================

create table if not exists public.content_sources (
  id text primary key, name text not null,
  kind text not null check (kind in ('novel','manga','manhwa','metadata')),
  base_url text not null, license_policy text not null default 'public_domain',
  provides_text boolean not null default false, enabled boolean not null default true,
  rate_limit_rps numeric(5,2) not null default 1, max_concurrency int not null default 2,
  last_tested_at timestamptz, last_test_ok boolean, last_error text,
  config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.works (
  id bigint generated always as identity primary key,
  title_id bigint unique references public.titles(id) on delete set null,
  format text not null check (format in ('novel','manga','manhwa')),
  title text not null, title_norm text not null, author text, author_norm text,
  language text not null default 'en', description text, cover_url text, year int,
  subjects text[] not null default '{}', license text,
  readable_status text not null default 'discovered'
    check (readable_status in ('discovered','verified','qualified','metadata_only','rejected')),
  reject_reason text,
  chapter_count int not null default 0,
  paragraph_count int not null default 0,                 -- counted at verification time (nothing stored)
  provider_rating numeric(4,2),                           -- EXTERNAL provider rating, 0..5 scale (never user ratings)
  provider_rating_count int,
  provider_rating_source text,
  enriched_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists works_dedup_uq on public.works (format, title_norm, coalesce(author_norm,''), language);
create index if not exists works_status_idx on public.works (readable_status, format);
create index if not exists works_lang_idx on public.works (language);
create index if not exists works_enrich_idx on public.works (enriched_at nulls first, id) where readable_status = 'qualified';

create table if not exists public.work_sources (
  id bigint generated always as identity primary key,
  work_id bigint not null references public.works(id) on delete cascade,
  source_id text not null references public.content_sources(id),
  external_id text not null, source_url text, text_url text,
  raw_meta jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists work_sources_work_idx on public.work_sources (work_id);

-- chapters = the chapter LIST only. `ref` tells the reader API where to fetch the content from the source.
alter table public.chapters add column if not exists work_id bigint references public.works(id) on delete cascade;
alter table public.chapters add column if not exists source_id text references public.content_sources(id);
alter table public.chapters add column if not exists is_real boolean not null default false;
alter table public.chapters add column if not exists paragraph_count int not null default 0;
alter table public.chapters add column if not exists word_count int not null default 0;
alter table public.chapters add column if not exists page_count int not null default 0;
alter table public.chapters add column if not exists split_method text;
alter table public.chapters add column if not exists ref jsonb;
create index if not exists chapters_work_idx on public.chapters (work_id, number);

create table if not exists public.import_jobs (
  id bigint generated always as identity primary key,
  campaign text not null, source_id text references public.content_sources(id),
  status text not null default 'queued' check (status in ('queued','running','paused','done','failed')),
  cursor jsonb not null default '{}'::jsonb, target int,
  discovered int not null default 0, verified int not null default 0, qualified int not null default 0,
  chapters_imported int not null default 0, paragraphs_imported int not null default 0,
  failed int not null default 0, skipped int not null default 0,
  heartbeat_at timestamptz, started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists import_jobs_campaign_idx on public.import_jobs (campaign, status);

create table if not exists public.import_logs (
  id bigint generated always as identity primary key,
  job_id bigint references public.import_jobs(id) on delete cascade,
  level text not null default 'info' check (level in ('info','warn','error')),
  external_id text, message text not null, detail jsonb, created_at timestamptz not null default now()
);
create index if not exists import_logs_job_idx on public.import_logs (job_id, created_at desc);
create index if not exists import_logs_created_idx on public.import_logs (created_at);

-- RLS ---------------------------------------------------------------
alter table public.content_sources enable row level security;
alter table public.works enable row level security;
alter table public.work_sources enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_logs enable row level security;

drop policy if exists works_read on public.works;
create policy works_read on public.works for select using (readable_status = 'qualified' or public.is_admin());
drop policy if exists works_admin on public.works;
create policy works_admin on public.works for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists content_sources_read on public.content_sources;
create policy content_sources_read on public.content_sources for select using (true);
drop policy if exists content_sources_admin on public.content_sources;
create policy content_sources_admin on public.content_sources for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists work_sources_read on public.work_sources;
create policy work_sources_read on public.work_sources for select using (true);
drop policy if exists work_sources_admin on public.work_sources;
create policy work_sources_admin on public.work_sources for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists import_jobs_admin on public.import_jobs;
create policy import_jobs_admin on public.import_jobs for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists import_logs_admin on public.import_logs;
create policy import_logs_admin on public.import_logs for all using (public.is_admin()) with check (public.is_admin());

-- Storage: only the `covers` bucket (re-hosted covers that cannot be hot-linked). Nothing else is stored.
insert into storage.buckets (id, name, public) values ('covers','covers',true) on conflict (id) do nothing;
drop policy if exists "covers public read" on storage.objects;
create policy "covers public read" on storage.objects for select using (bucket_id = 'covers');

insert into public.content_sources (id,name,kind,base_url,license_policy,provides_text,rate_limit_rps,max_concurrency) values
  ('gutendex','Project Gutenberg (Gutendex)','novel','https://gutendex.com','public_domain',true,1,2),
  ('wikisource','Wikisource','novel','https://wikisource.org','open_license',true,1,1),
  ('archive','Internet Archive','novel','https://archive.org','public_domain',true,0.5,1),
  ('openlibrary','Open Library','metadata','https://openlibrary.org','metadata_only',false,1,1),
  ('jikan','Jikan (MyAnimeList data)','metadata','https://api.jikan.moe','metadata_only',false,0.4,1),
  ('mangadex','MangaDex (official API)','manga','https://api.mangadex.org','open_license',true,0.5,1)
on conflict (id) do nothing;

-- Import RPC for novels: one call per work, NO text. Chapters carry {number,name,words,paragraph_count,split_method,ref}.
create or replace function public.import_work(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title_id bigint; v_work_id bigint; c jsonb; v_ch int := 0; v_pa int := 0; v_chap_id bigint;
  v_tn text := p->>'title_norm'; v_an text := nullif(p->>'author_norm',''); v_lang text := coalesce(p->>'language','en');
  v_rating numeric := nullif(p->>'rating','')::numeric; v_rc int := coalesce(nullif(p->>'rating_count','')::int, 0);
begin
  if jsonb_array_length(coalesce(p->'chapters','[]')) = 0 then return jsonb_build_object('status','rejected','reason','no_chapters'); end if;
  select id into v_work_id from works where format='novel' and title_norm=v_tn and coalesce(author_norm,'')=coalesce(v_an,'') and language=v_lang;
  if v_work_id is not null then
    insert into work_sources(work_id,source_id,external_id,source_url,text_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',p->>'text_url',coalesce(p->'raw_meta','{}'))
      on conflict (source_id,external_id) do nothing;
    if exists (select 1 from chapters where work_id=v_work_id and is_real) then return jsonb_build_object('status','duplicate','work_id',v_work_id); end if;
  end if;
  select id into v_title_id from titles where external_source=p->>'source_id' and external_id=p->>'external_id' order by id limit 1;
  if v_title_id is null then
    insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url,rating,rating_count)
    values (p->>'source_id',p->>'external_id',p->>'title',p->>'author','novel','completed',nullif(p->>'year','')::int,v_lang,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'description',p->>'cover_url',coalesce(v_rating,0),v_rc)
    returning id into v_title_id;
  end if;
  if v_work_id is null then select id into v_work_id from works where title_id=v_title_id; end if;
  if v_work_id is null then
    insert into works(title_id,format,title,title_norm,author,author_norm,language,description,cover_url,year,subjects,license,readable_status,provider_rating,provider_rating_count,provider_rating_source)
    values (v_title_id,'novel',p->>'title',v_tn,p->>'author',v_an,v_lang,p->>'description',p->>'cover_url',nullif(p->>'year','')::int,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'license','verified',v_rating,v_rc,p->>'rating_source')
    returning id into v_work_id;
    insert into work_sources(work_id,source_id,external_id,source_url,text_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',p->>'text_url',coalesce(p->'raw_meta','{}'))
      on conflict (source_id,external_id) do nothing;
  end if;
  for c in select * from jsonb_array_elements(p->'chapters') loop
    select id into v_chap_id from chapters where title_id=v_title_id and number=(c->>'number')::int and version='official' order by id limit 1;
    if v_chap_id is null then
      insert into chapters(title_id,number,name,version,work_id,source_id,is_real,paragraph_count,word_count,split_method,ref)
      values (v_title_id,(c->>'number')::int,c->>'name','official',v_work_id,p->>'source_id',true,coalesce((c->>'paragraph_count')::int,0),coalesce((c->>'words')::int,0),c->>'split_method',c->'ref');
    else
      update chapters set name=c->>'name', work_id=v_work_id, source_id=p->>'source_id', is_real=true, paragraph_count=coalesce((c->>'paragraph_count')::int,0),
             word_count=coalesce((c->>'words')::int,0), split_method=c->>'split_method', ref=c->'ref' where id=v_chap_id;
    end if;
    v_ch := v_ch + 1; v_pa := v_pa + coalesce((c->>'paragraph_count')::int,0);
  end loop;
  update titles set chapter_count=v_ch where id=v_title_id;
  update works set chapter_count=v_ch, paragraph_count=v_pa, readable_status='qualified', updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'paragraphs',v_pa);
end $$;
revoke all on function public.import_work(jsonb) from public, anon, authenticated;
grant execute on function public.import_work(jsonb) to service_role;

-- Import RPC for manga / manhwa: chapter list + source reference + page COUNT. No image URLs are stored.
create or replace function public.import_comic(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title_id bigint; v_work_id bigint; v_chap_id bigint; c jsonb; v_ch int := 0; v_pg int := 0;
  v_fmt text := p->>'format'; v_tn text := p->>'title_norm'; v_an text := nullif(p->>'author_norm',''); v_lang text := coalesce(p->>'language','en');
  v_rating numeric := nullif(p->>'rating','')::numeric; v_rc int := coalesce(nullif(p->>'rating_count','')::int, 0);
begin
  if v_fmt not in ('manga','manhwa') then return jsonb_build_object('status','rejected','reason','bad_format'); end if;
  if jsonb_array_length(coalesce(p->'chapters','[]')) = 0 then return jsonb_build_object('status','rejected','reason','no_chapters'); end if;
  select id into v_title_id from titles where external_source=p->>'source_id' and external_id=p->>'external_id' order by id limit 1;
  if v_title_id is null then
    insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url,is_mature,rating,rating_count)
    values (p->>'source_id',p->>'external_id',p->>'title',p->>'author',v_fmt,coalesce(p->>'status','ongoing'),nullif(p->>'year','')::int,v_lang,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'description',p->>'cover_url',coalesce((p->>'is_mature')::boolean,false),coalesce(v_rating,0),v_rc)
    returning id into v_title_id;
  end if;
  select id into v_work_id from works where title_id=v_title_id;
  if v_work_id is null then
    insert into works(title_id,format,title,title_norm,author,author_norm,language,description,cover_url,year,subjects,license,readable_status,provider_rating,provider_rating_count,provider_rating_source)
    values (v_title_id,v_fmt,p->>'title',v_tn,p->>'author',v_an,v_lang,p->>'description',p->>'cover_url',nullif(p->>'year','')::int,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'license','verified',v_rating,v_rc,p->>'rating_source')
    on conflict do nothing returning id into v_work_id;
    if v_work_id is null then select id into v_work_id from works where format=v_fmt and title_norm=v_tn and coalesce(author_norm,'')=coalesce(v_an,'') and language=v_lang; end if;
    insert into work_sources(work_id,source_id,external_id,source_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',coalesce(p->'raw_meta','{}')) on conflict (source_id,external_id) do nothing;
  end if;
  for c in select * from jsonb_array_elements(p->'chapters') loop
    select id into v_chap_id from chapters where title_id=v_title_id and number=(c->>'number')::int and version='official' order by id limit 1;
    if v_chap_id is null then
      insert into chapters(title_id,number,name,version,work_id,source_id,is_real,page_count,split_method,ref)
      values (v_title_id,(c->>'number')::int,c->>'name','official',v_work_id,p->>'source_id',true,coalesce((c->>'page_count')::int,0),'source_chapter',c->'ref');
    else
      update chapters set name=c->>'name', work_id=v_work_id, source_id=p->>'source_id', is_real=true, page_count=coalesce((c->>'page_count')::int,0), split_method='source_chapter', ref=c->'ref' where id=v_chap_id;
    end if;
    v_ch := v_ch + 1; v_pg := v_pg + coalesce((c->>'page_count')::int,0);
  end loop;
  update titles set chapter_count=(select count(*) from chapters where title_id=v_title_id and is_real) where id=v_title_id;
  update works set chapter_count=v_ch, readable_status='qualified', updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'pages',v_pg);
end $$;
revoke all on function public.import_comic(jsonb) from public, anon, authenticated;
grant execute on function public.import_comic(jsonb) to service_role;

-- Disk guard + log retention (service role only). The worker stops importing before the free plan fills up.
create or replace function public.db_size_mb() returns numeric language sql security definer set search_path = public as
$$ select round(pg_database_size(current_database()) / 1048576.0, 1) $$;
revoke all on function public.db_size_mb() from public, anon, authenticated;
grant execute on function public.db_size_mb() to service_role;

create or replace function public.prune_import_logs(days int default 7) returns int language plpgsql security definer set search_path = public as
$$ declare n int; begin delete from import_logs where created_at < now() - make_interval(days => days) and message <> 'cycle summary'; get diagnostics n = row_count; return n; end $$;
revoke all on function public.prune_import_logs(int) from public, anon, authenticated;
grant execute on function public.prune_import_logs(int) to service_role;

create or replace view public.import_metrics with (security_invoker = true) as
  select format, readable_status, count(*) as works, coalesce(sum(chapter_count),0) as chapters, coalesce(sum(paragraph_count),0) as paragraphs
  from public.works group by format, readable_status;
