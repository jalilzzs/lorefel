-- =====================================================================
-- PageLight — Real content pipeline (ADDITIVE, idempotent, non-destructive)
-- Existing: titles, chapters, user_library, reading_progress, reviews ... are kept.
-- `works` is the canonical import record; `titles` stays the user-facing row
-- (bookmarks/libraries/ratings keep pointing at titles.id). works.title_id links them.
-- Writes to new tables are service-role only (workers). Service key never ships to the browser.
-- =====================================================================

-- 1. content_sources -------------------------------------------------
create table if not exists public.content_sources (
  id              text primary key,                    -- 'gutendex','openlibrary','wikisource','standardebooks','archive'
  name            text not null,
  kind            text not null check (kind in ('novel','manga','manhwa','metadata')),
  base_url        text not null,
  license_policy  text not null default 'public_domain', -- public_domain | open_license | metadata_only
  provides_text   boolean not null default false,        -- has full readable text we may store
  enabled         boolean not null default true,
  rate_limit_rps  numeric(5,2) not null default 1,
  max_concurrency int not null default 2,
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_error      text,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- 2. works -----------------------------------------------------------
create table if not exists public.works (
  id             bigint generated always as identity primary key,
  title_id       bigint unique references public.titles(id) on delete set null,
  format         text not null check (format in ('novel','manga','manhwa')),
  title          text not null,
  title_norm     text not null,                         -- normalized for dedup
  author         text,
  author_norm    text,
  language       text not null default 'en',
  description    text,
  cover_url      text,
  year           int,
  subjects       text[] not null default '{}',
  license        text,                                  -- e.g. 'Public domain in the USA'
  readable_status text not null default 'discovered'
    check (readable_status in ('discovered','verified','qualified','metadata_only','rejected')),
  reject_reason  text,
  chapter_count  int not null default 0,
  paragraph_count int not null default 0,
  provider_rating numeric(4,2),                         -- EXTERNAL provider rating only (never user ratings)
  provider_rating_source text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists works_dedup_uq on public.works (format, title_norm, coalesce(author_norm,''), language);
create index if not exists works_status_idx on public.works (readable_status, format);
create index if not exists works_lang_idx   on public.works (language);

-- 3. work_sources ----------------------------------------------------
create table if not exists public.work_sources (
  id            bigint generated always as identity primary key,
  work_id       bigint not null references public.works(id) on delete cascade,
  source_id     text   not null references public.content_sources(id),
  external_id   text   not null,
  source_url    text,
  text_url      text,
  raw_meta      jsonb not null default '{}'::jsonb,
  fetched_at    timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists work_sources_work_idx on public.work_sources (work_id);

-- 4. chapters: extend existing table additively ----------------------
alter table public.chapters add column if not exists work_id bigint references public.works(id) on delete cascade;
alter table public.chapters add column if not exists source_id text references public.content_sources(id);
alter table public.chapters add column if not exists is_real boolean not null default false;  -- true only for imported real content
alter table public.chapters add column if not exists paragraph_count int not null default 0;
alter table public.chapters add column if not exists word_count int not null default 0;
alter table public.chapters add column if not exists page_count int not null default 0;
alter table public.chapters add column if not exists split_method text;  -- 'source_toc' | 'source_headings' | 'single_section'
create index if not exists chapters_work_idx on public.chapters (work_id, number);
create unique index if not exists chapters_work_num_uq on public.chapters (work_id, number) where work_id is not null;

-- 5. chapter_paragraphs ---------------------------------------------
create table if not exists public.chapter_paragraphs (
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  idx        int    not null,
  text       text   not null,
  kind       text   not null default 'p' check (kind in ('p','heading','quote','verse')),
  primary key (chapter_id, idx)
);

-- 6. chapter_pages (manga / manhwa) ---------------------------------
create table if not exists public.chapter_pages (
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  idx        int    not null,
  image_url  text   not null,
  storage_path text,
  width int, height int,
  primary key (chapter_id, idx)
);

-- 7. import_jobs / import_logs --------------------------------------
create table if not exists public.import_jobs (
  id            bigint generated always as identity primary key,
  campaign      text not null,                          -- e.g. INITIAL_NOVEL_LIBRARY_10000
  source_id     text references public.content_sources(id),
  status        text not null default 'queued' check (status in ('queued','running','paused','done','failed')),
  cursor        jsonb not null default '{}'::jsonb,     -- checkpoint (page/next url)
  target        int,
  discovered    int not null default 0,
  verified      int not null default 0,
  qualified     int not null default 0,
  chapters_imported   int not null default 0,
  paragraphs_imported int not null default 0,
  failed        int not null default 0,
  skipped       int not null default 0,
  heartbeat_at  timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists import_jobs_campaign_idx on public.import_jobs (campaign, status);

create table if not exists public.import_logs (
  id        bigint generated always as identity primary key,
  job_id    bigint references public.import_jobs(id) on delete cascade,
  level     text not null default 'info' check (level in ('info','warn','error')),
  external_id text,
  message   text not null,
  detail    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_logs_job_idx on public.import_logs (job_id, created_at desc);

-- 8. RLS --------------------------------------------------------------
alter table public.content_sources    enable row level security;
alter table public.works              enable row level security;
alter table public.work_sources       enable row level security;
alter table public.chapter_paragraphs enable row level security;
alter table public.chapter_pages      enable row level security;
alter table public.import_jobs        enable row level security;
alter table public.import_logs        enable row level security;

-- public read of readable content only (mature gating handled via titles/chapters policy)
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

-- paragraphs / pages inherit visibility from their chapter (chapters_read policy applies via exists)
drop policy if exists paragraphs_read on public.chapter_paragraphs;
create policy paragraphs_read on public.chapter_paragraphs for select
  using (exists (select 1 from public.chapters c where c.id = chapter_id));
drop policy if exists paragraphs_admin on public.chapter_paragraphs;
create policy paragraphs_admin on public.chapter_paragraphs for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pages_read on public.chapter_pages;
create policy pages_read on public.chapter_pages for select
  using (exists (select 1 from public.chapters c where c.id = chapter_id));
drop policy if exists pages_admin on public.chapter_pages;
create policy pages_admin on public.chapter_pages for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists import_jobs_admin on public.import_jobs;
create policy import_jobs_admin on public.import_jobs for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists import_logs_admin on public.import_logs;
create policy import_logs_admin on public.import_logs for all using (public.is_admin()) with check (public.is_admin());
-- The service role bypasses RLS: workers write; browsers never hold that key.

-- 9. Storage buckets (public read, service-role write) ---------------
insert into storage.buckets (id, name, public) values
  ('covers','covers',true),('banners','banners',true),('novel-assets','novel-assets',true),
  ('manga-pages','manga-pages',true),('manhwa-pages','manhwa-pages',true)
on conflict (id) do nothing;

do $$
declare b text;
begin
  foreach b in array array['covers','banners','novel-assets','manga-pages','manhwa-pages'] loop
    execute format('drop policy if exists %I on storage.objects', b || ' public read');
    execute format('create policy %I on storage.objects for select using (bucket_id = %L)', b || ' public read', b);
  end loop;
end $$;

-- 10. Seed source registry (honest: metadata-only sources flagged) ----
insert into public.content_sources (id,name,kind,base_url,license_policy,provides_text,rate_limit_rps,max_concurrency) values
  ('gutendex','Project Gutenberg (Gutendex)','novel','https://gutendex.com','public_domain',true,1,2),
  ('standardebooks','Standard Ebooks','novel','https://standardebooks.org','public_domain',true,0.5,1),
  ('wikisource','Wikisource','novel','https://en.wikisource.org','open_license',true,1,1),
  ('openlibrary','Open Library','metadata','https://openlibrary.org','metadata_only',false,1,2),
  ('archive','Internet Archive','novel','https://archive.org','public_domain',true,0.5,1)
on conflict (id) do nothing;

-- 11. Transactional, idempotent import RPC (service role only) --------
-- One call = one work with all its real chapters/paragraphs. Re-running never duplicates.
create or replace function public.import_work(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title_id bigint; v_work_id bigint; v_chap_id bigint; c jsonb; v_ch int := 0; v_pa int := 0; v_existing int;
  v_tn text := p->>'title_norm'; v_an text := nullif(p->>'author_norm','');
  v_lang text := coalesce(p->>'language','en');
begin
  if jsonb_array_length(coalesce(p->'chapters','[]')) = 0 then
    return jsonb_build_object('status','rejected','reason','no_chapters');
  end if;

  select id into v_work_id from works
   where format='novel' and title_norm=v_tn and coalesce(author_norm,'')=coalesce(v_an,'') and language=v_lang;

  if v_work_id is not null then
    select count(*) into v_existing from chapters where work_id=v_work_id and is_real;
    insert into work_sources(work_id,source_id,external_id,source_url,text_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',p->>'text_url',coalesce(p->'raw_meta','{}'))
      on conflict (source_id,external_id) do nothing;
    if v_existing > 0 then return jsonb_build_object('status','duplicate','work_id',v_work_id); end if;
  end if;

  insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url)
  values (p->>'source_id',p->>'external_id',p->>'title',p->>'author','novel','completed',
          nullif(p->>'year','')::int,v_lang,
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),
          p->>'description',p->>'cover_url')
  on conflict (external_source,external_id) do update set title=excluded.title, author=excluded.author, updated_at=now()
  returning id into v_title_id;

  if v_work_id is null then
    insert into works(title_id,format,title,title_norm,author,author_norm,language,description,cover_url,year,subjects,license,readable_status)
    values (v_title_id,'novel',p->>'title',v_tn,p->>'author',v_an,v_lang,p->>'description',p->>'cover_url',
            nullif(p->>'year','')::int,coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),
            p->>'license','verified')
    returning id into v_work_id;
    insert into work_sources(work_id,source_id,external_id,source_url,text_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',p->>'text_url',coalesce(p->'raw_meta','{}'))
      on conflict (source_id,external_id) do nothing;
  end if;

  for c in select * from jsonb_array_elements(p->'chapters') loop
    insert into chapters(title_id,number,name,version,content,work_id,source_id,is_real,paragraph_count,word_count,split_method)
    values (v_title_id,(c->>'number')::int,c->>'name','official',null,v_work_id,p->>'source_id',true,
            jsonb_array_length(c->'paragraphs'),(c->>'words')::int,c->>'split_method')
    on conflict (title_id,number,version) do update set name=excluded.name, paragraph_count=excluded.paragraph_count,
            word_count=excluded.word_count, is_real=true, work_id=excluded.work_id
    returning id into v_chap_id;
    delete from chapter_paragraphs where chapter_id=v_chap_id;
    insert into chapter_paragraphs(chapter_id,idx,text)
      select v_chap_id, (o-1)::int, t from jsonb_array_elements_text(c->'paragraphs') with ordinality as x(t,o);
    v_ch := v_ch + 1; v_pa := v_pa + jsonb_array_length(c->'paragraphs');
  end loop;

  update titles set chapter_count=v_ch where id=v_title_id;
  update works set chapter_count=v_ch, paragraph_count=v_pa, readable_status='qualified', updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'paragraphs',v_pa);
end $$;
revoke all on function public.import_work(jsonb) from public, anon, authenticated;
grant execute on function public.import_work(jsonb) to service_role;

-- 12. Comic import RPC (manga / manhwa: real ordered page images only) -----
create or replace function public.import_comic(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title_id bigint; v_work_id bigint; v_chap_id bigint; c jsonb; v_ch int := 0; v_pg int := 0;
  v_fmt text := p->>'format'; v_tn text := p->>'title_norm'; v_an text := nullif(p->>'author_norm','');
  v_lang text := coalesce(p->>'language','en');
begin
  if v_fmt not in ('manga','manhwa') then return jsonb_build_object('status','rejected','reason','bad_format'); end if;
  if jsonb_array_length(coalesce(p->'chapters','[]')) = 0 then return jsonb_build_object('status','rejected','reason','no_chapters'); end if;
  insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url,is_mature)
  values (p->>'source_id',p->>'external_id',p->>'title',p->>'author',v_fmt,coalesce(p->>'status','ongoing'),nullif(p->>'year','')::int,v_lang,
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'description',p->>'cover_url',coalesce((p->>'is_mature')::boolean,false))
  on conflict (external_source,external_id) do update set title=excluded.title, updated_at=now()
  returning id into v_title_id;
  select id into v_work_id from works where title_id=v_title_id;
  if v_work_id is null then
    insert into works(title_id,format,title,title_norm,author,author_norm,language,description,cover_url,year,subjects,license,readable_status)
    values (v_title_id,v_fmt,p->>'title',v_tn,p->>'author',v_an,v_lang,p->>'description',p->>'cover_url',nullif(p->>'year','')::int,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'license','verified')
    on conflict do nothing returning id into v_work_id;
    if v_work_id is null then select id into v_work_id from works where format=v_fmt and title_norm=v_tn and coalesce(author_norm,'')=coalesce(v_an,'') and language=v_lang; end if;
    insert into work_sources(work_id,source_id,external_id,source_url,raw_meta)
      values (v_work_id,p->>'source_id',p->>'external_id',p->>'source_url',coalesce(p->'raw_meta','{}')) on conflict (source_id,external_id) do nothing;
  end if;
  for c in select * from jsonb_array_elements(p->'chapters') loop
    if jsonb_array_length(coalesce(c->'pages','[]')) = 0 then continue; end if;
    insert into chapters(title_id,number,name,version,work_id,source_id,is_real,page_count,split_method)
    values (v_title_id,(c->>'number')::int,c->>'name','official',v_work_id,p->>'source_id',true,jsonb_array_length(c->'pages'),'source_chapter')
    on conflict (title_id,number,version) do update set name=excluded.name, page_count=excluded.page_count, is_real=true, work_id=excluded.work_id
    returning id into v_chap_id;
    delete from chapter_pages where chapter_id=v_chap_id;
    insert into chapter_pages(chapter_id,idx,image_url)
      select v_chap_id,(o-1)::int,u from jsonb_array_elements_text(c->'pages') with ordinality as x(u,o);
    v_ch := v_ch + 1; v_pg := v_pg + jsonb_array_length(c->'pages');
  end loop;
  if v_ch = 0 then return jsonb_build_object('status','rejected','reason','no_pages'); end if;
  update titles set chapter_count=(select count(*) from chapters where title_id=v_title_id and is_real) where id=v_title_id;
  update works set chapter_count=(select count(*) from chapters where work_id=v_work_id), readable_status='qualified', updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'pages',v_pg);
end $$;
revoke all on function public.import_comic(jsonb) from public, anon, authenticated;
grant execute on function public.import_comic(jsonb) to service_role;

insert into public.content_sources (id,name,kind,base_url,license_policy,provides_text,rate_limit_rps,max_concurrency) values
  ('mangadex','MangaDex (official API, at-home pages)','manga','https://api.mangadex.org','open_license',true,2,1)
on conflict (id) do nothing;

-- Admin-facing live metrics (admin only via RLS on works / import_jobs)
create or replace view public.import_metrics with (security_invoker = true) as
  select format, readable_status, count(*) as works, coalesce(sum(chapter_count),0) as chapters, coalesce(sum(paragraph_count),0) as paragraphs
  from public.works group by format, readable_status;
