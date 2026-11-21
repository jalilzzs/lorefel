-- =====================================================================
-- Cleanup of legacy FAKE content + batched import support. Idempotent; run once in the Supabase SQL editor.
-- 1) removes placeholder chapters written by the old seed-chapters.mjs
-- 2) recomputes titles.chapter_count from chapters that really exist (old rows carried invented counts such as 12)
-- 3) import_work gains append/final flags so big books are sent in small batches (avoids 502 / body-size / timeout errors)
-- =====================================================================
delete from public.chapters
 where not is_real and (
   array_to_string(pages, ' ') ilike '%placehold.co%'
   or content like 'The rain tapped steadily against the narrow window of the archive%');

update public.titles t set chapter_count = coalesce((select count(*) from public.chapters c where c.title_id = t.id), 0);

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

  update titles set chapter_count=(select count(*) from chapters where work_id=v_work_id and is_real) where id=v_title_id;
  update works set chapter_count=(select count(*) from chapters where work_id=v_work_id and is_real),
    paragraph_count=(select coalesce(sum(paragraph_count),0) from chapters where work_id=v_work_id and is_real),
    readable_status=case when coalesce(p->>'final','true')='true' then 'qualified' else 'verified' end, updated_at=now() where id=v_work_id;
  return jsonb_build_object('status','imported','work_id',v_work_id,'title_id',v_title_id,'chapters',v_ch,'paragraphs',v_pa);
end $$;
revoke all on function public.import_work(jsonb) from public, anon, authenticated;
grant execute on function public.import_work(jsonb) to service_role;
