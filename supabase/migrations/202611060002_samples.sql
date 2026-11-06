create function public.seed_samples() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); ev uuid; gid uuid; reg uuid; ent uuid; i int; kind text; num int; value numeric;
begin
 if actor is null then raise exception 'UNAUTHORIZED: 請先登入'; end if;
 perform pg_advisory_xact_lock(hashtext(actor::text));
 perform pg_advisory_xact_lock_shared(9286202601);
 foreach kind in array array['24 位舞者報到演練','海選正常','海選截止線同分','海選漏評','8 強 Battle 現場'] loop
  if exists(select 1 from events where sample_key=actor::text||kind) then continue; end if;
  insert into events(owner_id,title,city,venue,starts_at,deadline,registration_open,rules,dj,mc,sample_key)
   values(actor,'【範例】'||kind,'台北','合成資料演練場',now()+interval '30 days',now()+interval '20 days',true,'合成資料，僅供演練。截止線同分採原評審加賽後修分。','Sample DJ','Sample MC',actor::text||kind) returning id into ev;
  insert into groups(event_id,name,style,fee,slots) values(ev,'All Style 1 on 1','All Style',500,8) returning id into gid;
  insert into groups(event_id,name,style,fee,slots) values(ev,'Hip Hop 1 on 1','Hip Hop',400,4);
  insert into memberships(event_id,user_id,role,group_ids,starts_at,ends_at) values(ev,actor,'judge',array[gid],now()-interval '1 day',now()+interval '365 days');
  num:=case when kind='8 強 Battle 現場' then 8 else 24 end;
  for i in 1..num loop
   insert into registrations(event_id,dancer,phone,request_id) values(ev,'Sample Dancer '||lpad(i::text,2,'0'),'090000'||lpad(i::text,4,'0'),gen_random_uuid()) returning id into reg;
   insert into entries(registration_id,group_id,checked_at,paid,paid_at) values(reg,gid,case when kind='24 位舞者報到演練' and i>12 then null else now() end,i%3<>0,case when i%3<>0 then now() else null end) returning id into ent;
   if kind<>'24 位舞者報到演練' and not (kind='海選漏評' and i=24) then
    value:=100-i;
    if kind='海選截止線同分' and i=9 then value:=92; end if;
    insert into scores(entry_id,judge_id,score,comment) values(ent,actor,value,'合成演練分數');
   end if;
  end loop;
  if kind<>'24 位舞者報到演練' then update groups set closed_at=now(),closed_by=actor,version=version+1 where id=gid; end if;
  if kind='8 強 Battle 現場' then
   perform command('lock',jsonb_build_object('event_id',ev,'group_id',gid,'version',2));
   perform command('publish',jsonb_build_object('event_id',ev,'group_id',gid,'version',3));
  end if;
  insert into audit(event_id,actor,action,payload) values(ev,actor,'seed_sample',jsonb_build_object('scenario',kind));
 end loop;
 return jsonb_build_object('message','範例情境已備妥；重複執行不會複製');
end $$;
revoke all on function public.seed_samples() from public,anon;
grant execute on function public.seed_samples() to authenticated;
