-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- The import functions no longer depend on unique constraints of titles/chapters (they look up, then update or insert).
-- Safe to run more than once.
alter table public.chapters add column if not exists page_count int not null default 0;
create index if not exists titles_ext_idx on public.titles (external_source, external_id);
create index if not exists chapters_title_num_ver_idx on public.chapters (title_id, number, version);

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
    if v_existing > 0 and coalesce(p->>'append','false') <> 'true' then return jsonb_build_object('status','duplicate','work_id',v_work_id); end if;
  end if;

  select id into v_title_id from titles where external_source=p->>'source_id' and external_id=p->>'external_id' order by id limit 1;
  if v_title_id is null then
    insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url)
    values (p->>'source_id',p->>'external_id',p->>'title',p->>'author','novel','completed',
            nullif(p->>'year','')::int,v_lang,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),
            p->>'description',p->>'cover_url')
    returning id into v_title_id;
  else
    update titles set title=p->>'title', author=p->>'author', updated_at=now() where id=v_title_id;
  end if;
  if v_work_id is null then select id into v_work_id from works where title_id=v_title_id; end if;

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
    select id into v_chap_id from chapters where title_id=v_title_id and number=(c->>'number')::int and version='official' order by id limit 1;
    if v_chap_id is null then
      insert into chapters(title_id,number,name,version,content,work_id,source_id,is_real,paragraph_count,word_count,split_method)
      values (v_title_id,(c->>'number')::int,c->>'name','official',null,v_work_id,p->>'source_id',true,
              jsonb_array_length(c->'paragraphs'),(c->>'words')::int,c->>'split_method')
      returning id into v_chap_id;
    else
      update chapters set name=c->>'name', content=null, pages=null, work_id=v_work_id, source_id=p->>'source_id', is_real=true,
             paragraph_count=jsonb_array_length(c->'paragraphs'), word_count=(c->>'words')::int, split_method=c->>'split_method'
       where id=v_chap_id;
    end if;
    delete from chapter_paragraphs where chapter_id=v_chap_id;
    insert into chapter_paragraphs(chapter_id,idx,text)
      select v_chap_id, (o-1)::int, t from jsonb_array_elements_text(c->'paragraphs') with ordinality as x(t,o);
    v_ch := v_ch + 1; v_pa := v_pa + jsonb_array_length(c->'paragraphs');
  end loop;

  update titles set chapter_count=(select count(*) from chapters where work_id=v_work_id and is_real) where id=v_title_id;
  update works set chapter_count=(select count(*) from chapters where work_id=v_work_id and is_real),
    paragraph_count=(select coalesce(sum(paragraph_count),0) from chapters where work_id=v_work_id and is_real),
    readable_status=case when coalesce(p->>'final','true')='true' then 'qualified' else 'verified' end, updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'paragraphs',v_pa);
end $$;
revoke all on function public.import_work(jsonb) from public, anon, authenticated;
grant execute on function public.import_work(jsonb) to service_role;

create or replace function public.import_comic(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title_id bigint; v_work_id bigint; v_chap_id bigint; c jsonb; v_ch int := 0; v_pg int := 0;
  v_fmt text := p->>'format'; v_tn text := p->>'title_norm'; v_an text := nullif(p->>'author_norm','');
  v_lang text := coalesce(p->>'language','en');
begin
  if v_fmt not in ('manga','manhwa') then return jsonb_build_object('status','rejected','reason','bad_format'); end if;
  if jsonb_array_length(coalesce(p->'chapters','[]')) = 0 then return jsonb_build_object('status','rejected','reason','no_chapters'); end if;
  select id into v_title_id from titles where external_source=p->>'source_id' and external_id=p->>'external_id' order by id limit 1;
  if v_title_id is null then
    insert into titles(external_source,external_id,title,author,format,status,year,language,tags,synopsis,cover_url,is_mature)
    values (p->>'source_id',p->>'external_id',p->>'title',p->>'author',v_fmt,coalesce(p->>'status','ongoing'),nullif(p->>'year','')::int,v_lang,
            coalesce(array(select jsonb_array_elements_text(coalesce(p->'subjects','[]'))),'{}'),p->>'description',p->>'cover_url',coalesce((p->>'is_mature')::boolean,false))
    returning id into v_title_id;
  else
    update titles set title=p->>'title', updated_at=now() where id=v_title_id;
  end if;
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
    select id into v_chap_id from chapters where title_id=v_title_id and number=(c->>'number')::int and version='official' order by id limit 1;
    if v_chap_id is null then
      insert into chapters(title_id,number,name,version,work_id,source_id,is_real,page_count,split_method)
      values (v_title_id,(c->>'number')::int,c->>'name','official',v_work_id,p->>'source_id',true,jsonb_array_length(c->'pages'),'source_chapter')
      returning id into v_chap_id;
    else
      update chapters set name=c->>'name', content=null, pages=null, work_id=v_work_id, source_id=p->>'source_id', is_real=true,
             page_count=jsonb_array_length(c->'pages'), split_method='source_chapter' where id=v_chap_id;
    end if;
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
