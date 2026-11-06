-- All writes use narrowly granted, transaction-bound RPCs. Tables are not API-readable.
revoke create on schema public from public;
create table public.events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 120), city text not null check(length(btrim(city)) between 1 and 80), venue text not null check(length(btrim(venue)) between 1 and 200),
 starts_at timestamptz not null, deadline timestamptz not null, registration_open boolean not null default false,
 rules text not null default '', dj text not null default '', mc text not null default '', judges text not null default '',
 version integer not null default 1, sample_key text unique, created_at timestamptz not null default now(), check(deadline<=starts_at)
);
create table public.groups (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80), style text not null check(length(btrim(style)) between 1 and 80), fee integer not null check(fee between 0 and 100000),
 slots integer not null default 8 check(slots in (2,4,8,16,32)), open boolean not null default true,
 closed_at timestamptz, closed_by uuid references auth.users, locked_at timestamptz,
 version integer not null default 1, unique(event_id,name)
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 user_id uuid not null references auth.users, role text not null check(role in ('admin','checkin','judge')),
 group_ids uuid[] not null default '{}', starts_at timestamptz not null, ends_at timestamptz not null,
 revoked_at timestamptz, reason text, check(ends_at>starts_at), unique(event_id,user_id,role)
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 email text not null, role text not null check(role in ('admin','checkin','judge')),
 group_ids uuid[] not null default '{}', starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','accepted','revoked')), created_by uuid not null references auth.users,
 check(ends_at>starts_at)
);
create table public.registrations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 dancer text not null check(length(dancer) between 1 and 60), phone text not null check(phone ~ '^09[0-9]{8}$'),
 number bigint generated always as identity unique, lookup_token uuid not null default gen_random_uuid() unique,
 request_id uuid not null, created_at timestamptz not null default now(), unique(event_id,phone), unique(event_id,request_id)
);
create table public.entries (
 id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.registrations on delete cascade,
 group_id uuid not null references public.groups on delete cascade, paid boolean not null default false,
 paid_at timestamptz, checked_at timestamptz, version integer not null default 1,
 unique(registration_id,group_id)
);
create table public.scores (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.entries on delete cascade,
 judge_id uuid not null references auth.users, score numeric(5,2) not null check(score between 0 and 100),
 comment text not null default '' check(length(comment)<=1000), version integer not null default 1,
 updated_at timestamptz not null default now(), unique(entry_id,judge_id)
);
create table public.score_history (
 id uuid primary key default gen_random_uuid(), score_id uuid not null references public.scores,
 old_score numeric not null, old_comment text not null, old_updated_at timestamptz not null,
 reason text not null, actor uuid not null references auth.users, created_at timestamptz not null default now()
);
create table public.matches (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups on delete cascade,
 round integer not null check(round>0), position integer not null, a uuid not null references public.entries,
 b uuid not null references public.entries, winner uuid references public.entries, confirmed_at timestamptz,
 version integer not null default 1, check(a<>b), check(winner is null or winner in (a,b)), unique(group_id,round,position)
);
alter table public.groups add column current_match uuid references public.matches;
create table public.votes (
 match_id uuid not null references public.matches on delete cascade, judge_id uuid not null references auth.users,
 entry_id uuid not null references public.entries, version integer not null default 1, primary key(match_id,judge_id)
);
create table public.snapshots (
 group_id uuid primary key references public.groups on delete cascade, event_id uuid not null references public.events,
 published boolean not null default false, payload jsonb not null, published_at timestamptz not null default now()
);
create table public.audit (
 id bigint generated always as identity primary key, event_id uuid not null references public.events,
 actor uuid not null references auth.users, action text not null, payload jsonb not null, created_at timestamptz not null default now()
);
create table public.registration_attempts (fingerprint text not null, created_at timestamptz not null default now());
create index groups_event on public.groups(event_id);
create index members_user on public.memberships(user_id,event_id) where revoked_at is null;
create index invites_email on public.invitations(lower(email)) where status='pending';
create unique index invites_pending on public.invitations(event_id,lower(email),role) where status='pending';
create index registration_event on public.registrations(event_id);
create index entries_group on public.entries(group_id);
create index scores_judge on public.scores(judge_id,entry_id);
create index matches_group on public.matches(group_id,round);
create index audit_event on public.audit(event_id,created_at);
create index attempts_time on public.registration_attempts(fingerprint,created_at);
do $$ declare t text; begin
 foreach t in array array['events','groups','memberships','invitations','registrations','entries','scores','score_history','matches','votes','snapshots','audit','registration_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;

create function public.can_access(e uuid, roles text[], g uuid default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from events where id=e and owner_id=auth.uid()) or exists(
 select 1 from memberships where event_id=e and user_id=auth.uid() and role=any(roles)
 and revoked_at is null and now() between starts_at and ends_at
 and (g is null or role='admin' or g=any(group_ids)))
$$;
create function public.event_public(e events) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'title',e.title,'city',e.city,'venue',e.venue,'starts_at',e.starts_at,
 'deadline',e.deadline,'registration_open',e.registration_open,'rules',e.rules,'dj',e.dj,'mc',e.mc,'judges',e.judges,
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'style',g.style,'fee',g.fee,'slots',g.slots,'open',g.open) order by g.name,g.id) from groups g where g.event_id=e.id),'[]'::jsonb))
$$;
create function public.browse_events() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(event_public(e) order by e.starts_at),'[]'::jsonb) from events e
$$;
create function public.live_snapshot(g uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select case when published then jsonb_build_object('published',true,'published_at',published_at,'data',payload)
 else jsonb_build_object('published',false) end from snapshots where group_id=g
$$;

create function public.register_dancer(p jsonb, fingerprint text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ev events; reg registrations; gids uuid[]; gid uuid; v_phone text; attempt_count int;
begin
 if fingerprint is null or length(fingerprint)<32 then raise exception 'INVALID: 缺少請求識別'; end if;
 perform pg_advisory_xact_lock(hashtext(fingerprint));
 delete from registration_attempts where created_at<now()-interval '1 hour';
 select count(*) into attempt_count from registration_attempts where registration_attempts.fingerprint=register_dancer.fingerprint and created_at>now()-interval '1 minute';
 if attempt_count>10 then raise exception 'RATE_LIMIT: 請稍後再試'; end if;
 select * into ev from events where id=(p->>'event_id')::uuid for update;
 if ev.id is null then raise exception 'NOT_FOUND: 活動不存在'; end if;
 v_phone:=regexp_replace(p->>'phone','[\s()\-]','','g');
 if v_phone like '+8869%' then v_phone:='0'||substring(v_phone from 5); end if;
 if v_phone !~ '^09[0-9]{8}$' or v_phone is null or length(trim(p->>'dancer')) not between 1 and 60 then raise exception 'INVALID: 請填寫舞名及有效台灣手機'; end if;
 select array_agg(x::uuid) into gids from jsonb_array_elements_text(p->'group_ids') x;
 if cardinality(gids) is null or cardinality(gids)=0 then raise exception 'INVALID: 至少選一組'; end if;
 select * into reg from registrations where event_id=ev.id and request_id=(p->>'request_id')::uuid;
 if reg.id is not null then
  if reg.phone<>v_phone or reg.dancer<>trim(p->>'dancer') or (select array_agg(group_id order by group_id) from entries where registration_id=reg.id)<>(select array_agg(distinct x order by x) from unnest(gids) x) then raise exception 'CONFLICT: 相同請求代碼內容不同'; end if;
  return jsonb_build_object('number',reg.number,'token',reg.lookup_token);
 end if;
 if not ev.registration_open or ev.deadline<now() then raise exception 'CLOSED: 報名已截止'; end if;
 if exists(select 1 from registrations where event_id=ev.id and registrations.phone=v_phone) then raise exception 'CONFLICT: 此手機已報名本活動'; end if;
 foreach gid in array gids loop
  if not exists(select 1 from groups where id=gid and event_id=ev.id and open and locked_at is null) then raise exception 'CLOSED: 所選組別目前不可報名'; end if;
 end loop;
 perform pg_advisory_xact_lock_shared(9286202601);
 insert into registrations(event_id,dancer,phone,request_id) values(ev.id,trim(p->>'dancer'),v_phone,(p->>'request_id')::uuid) returning * into reg;
 insert into entries(registration_id,group_id) select reg.id,x from (select distinct unnest(gids) x) q;
 return jsonb_build_object('number',reg.number,'token',reg.lookup_token);
end $$;

create function public.workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED: 請先登入'; end if;
 select jsonb_build_object(
 'user_id',auth.uid(),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from events e where can_access(e.id,array['admin','checkin','judge'])),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.name,g.id) from groups g where can_access(g.event_id,array['admin','checkin','judge'],g.id)),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from memberships m where can_access(m.event_id,array['admin']) or m.user_id=auth.uid()),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(to_jsonb(i)) from invitations i where can_access(i.event_id,array['admin']) or (lower(i.email)=(select lower(email) from auth.users where id=auth.uid()) and i.status='pending')),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'group_id',n.group_id,'dancer',r.dancer,'number',r.number,'version',n.version,'checked_at',n.checked_at)
 ||case when can_access(g.event_id,array['admin','checkin'],g.id) then jsonb_build_object('phone',r.phone,'token',r.lookup_token,'paid',n.paid,'paid_at',n.paid_at) else '{}'::jsonb end)
 from entries n join registrations r on r.id=n.registration_id join groups g on g.id=n.group_id
 where can_access(g.event_id,array['admin','checkin'],g.id) or (n.checked_at is not null and can_access(g.event_id,array['judge'],g.id))),'[]'::jsonb),
 'scores',coalesce((select jsonb_agg(to_jsonb(s)) from scores s join entries n on n.id=s.entry_id join groups g on g.id=n.group_id
 where can_access(g.event_id,array['admin']) or (s.judge_id=auth.uid() and can_access(g.event_id,array['judge'],g.id))),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by round,position) from matches m join groups g on g.id=m.group_id where can_access(g.event_id,array['admin','judge'],g.id)),'[]'::jsonb),
 'votes',coalesce((select jsonb_agg(to_jsonb(v)) from votes v join matches m on m.id=v.match_id join groups g on g.id=m.group_id where can_access(g.event_id,array['admin']) or (v.judge_id=auth.uid() and can_access(g.event_id,array['judge'],g.id))),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from audit where can_access(event_id,array['admin']) order by id desc limit 100) a),'[]'::jsonb)
 ) into result; return result;
end $$;

create function public.command(action text, p jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ev events; grp groups; ent entries; old scores; mat matches; inv invitations; mem memberships;
 actor uuid:=auth.uid(); reason text:=trim(coalesce(p->>'reason','')); gid uuid; eid uuid; ids uuid[]; judges uuid[];
 total int; missing int; loop_index int; cutoff numeric; following numeric; r int; win uuid; result jsonb:='{}'; newscore numeric;
begin
 if actor is null then raise exception 'UNAUTHORIZED: 請先登入'; end if;
 if action='create_event' then
  if length(trim(p->>'title')) not between 1 and 120 then raise exception 'INVALID: 請填寫活動名稱'; end if;
  insert into events(owner_id,title,city,venue,starts_at,deadline,rules,dj,mc,judges)
  values(actor,trim(p->>'title'),coalesce(p->>'city','台北'),coalesce(p->>'venue',''),(p->>'starts_at')::timestamptz,(p->>'deadline')::timestamptz,coalesce(p->>'rules',''),coalesce(p->>'dj',''),coalesce(p->>'mc',''),coalesce(p->>'judges','')) returning * into ev;
  if ev.deadline>ev.starts_at then raise exception 'INVALID: 報名截止不得晚於活動開始'; end if;
  insert into audit(event_id,actor,action,payload) values(ev.id,actor,action,jsonb_build_object('title',ev.title));
  return to_jsonb(ev);
 end if;
 if action='accept_invite' then
  select * into inv from invitations where id=(p->>'invitation_id')::uuid;
  if inv.id is null then raise exception 'FORBIDDEN: 邀請不存在'; end if;
  perform 1 from events where id=inv.event_id for update;
  select * into inv from invitations where id=(p->>'invitation_id')::uuid for update;
  if inv.id is null or inv.status<>'pending' or inv.ends_at<=now() or lower(inv.email) is distinct from (select lower(email) from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'FORBIDDEN: 邀請不存在、已失效或不屬於此帳號'; end if;
  if inv.role='judge' and exists(select 1 from groups g where g.id=any(inv.group_ids) and g.locked_at is not null and not exists(select 1 from memberships m where m.event_id=inv.event_id and m.user_id=actor and m.role='judge' and g.id=any(m.group_ids))) then raise exception 'LOCKED: 晉級鎖定後不可新增評審'; end if;
  insert into memberships(event_id,user_id,role,group_ids,starts_at,ends_at) values(inv.event_id,actor,inv.role,inv.group_ids,inv.starts_at,inv.ends_at)
  on conflict(event_id,user_id,role) do update set group_ids=excluded.group_ids,starts_at=excluded.starts_at,ends_at=excluded.ends_at,revoked_at=null,reason='接受新邀請';
  update invitations set status='accepted' where id=inv.id;
  insert into audit(event_id,actor,action,payload) values(inv.event_id,actor,action,jsonb_build_object('invitation_id',inv.id));
  return '{}'::jsonb;
 end if;
 eid:=(p->>'event_id')::uuid;
 select * into ev from events where id=eid for update;
 if ev.id is null then raise exception 'NOT_FOUND: 活動不存在'; end if;
 gid:=nullif(p->>'group_id','')::uuid;
 if gid is not null then
  select * into grp from groups where id=gid and event_id=eid for update;
  if grp.id is null then raise exception 'NOT_FOUND: 組別不屬於此活動'; end if;
 end if;
 if action in ('checkin','cancel_checkin','payment') then
  if not can_access(eid,array['admin','checkin'],gid) or gid is null then raise exception 'FORBIDDEN: 沒有本組報到權限'; end if;
 elsif action in ('score','vote') then
  if not exists(select 1 from memberships where event_id=eid and user_id=actor and role='judge' and gid=any(group_ids) and revoked_at is null and now() between starts_at and ends_at) then raise exception 'FORBIDDEN: 未被指派為本組評審'; end if;
 else
  if not can_access(eid,array['admin']) then raise exception 'FORBIDDEN: 需要主辦管理員權限'; end if;
 end if;
 if action in ('close_checkin','reopen_checkin','lock','next_round','publish','pause','set_current','confirm_winner','edit_group') and gid is null then raise exception 'INVALID: 請選擇組別'; end if;
 if action in ('edit_event','transfer_owner') and (p->>'version')::int is distinct from ev.version then raise exception 'CONFLICT: 活動已更新，請重新同步'; end if;
 if action in ('close_checkin','reopen_checkin','lock','next_round','publish','pause','set_current','edit_group') and (p->>'version')::int is distinct from grp.version then raise exception 'CONFLICT: 組別已更新，請重新同步'; end if;
 if action='edit_event' then
  update events set title=coalesce(p->>'title',title),city=coalesce(p->>'city',city),venue=coalesce(p->>'venue',venue),
  starts_at=coalesce((p->>'starts_at')::timestamptz,starts_at),deadline=coalesce((p->>'deadline')::timestamptz,deadline),
  registration_open=coalesce((p->>'registration_open')::boolean,registration_open),rules=coalesce(p->>'rules',rules),dj=coalesce(p->>'dj',dj),mc=coalesce(p->>'mc',mc),judges=coalesce(p->>'judges',events.judges),version=version+1 where id=eid;
 elsif action='create_group' then
  insert into groups(event_id,name,style,fee,slots) values(eid,p->>'name',p->>'style',(p->>'fee')::int,(p->>'slots')::int);
 elsif action='edit_group' then
  if grp.locked_at is not null then raise exception 'LOCKED: 晉級已鎖定'; end if;
  update groups set name=coalesce(p->>'name',name),style=coalesce(p->>'style',style),fee=coalesce((p->>'fee')::int,fee),slots=coalesce((p->>'slots')::int,slots),open=coalesce((p->>'open')::boolean,open),version=version+1 where id=gid;
 elsif action in ('invite','revoke_member','revoke_invite','transfer_owner','backup','restore') then
  if action in ('transfer_owner','backup','restore') and ev.owner_id<>actor then raise exception 'FORBIDDEN: 僅活動擁有者可操作'; end if;
  if action='invite' then
   if p->>'role'='admin' and ev.owner_id<>actor then raise exception 'FORBIDDEN: 僅擁有者可邀請主辦管理員'; end if;
   if p->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID: Email 格式錯誤'; end if;
   select coalesce(array_agg(x::uuid),'{}') into ids from jsonb_array_elements_text(p->'group_ids') x;
   if exists(select 1 from unnest(ids) x where not exists(select 1 from groups where id=x and event_id=eid)) or (p->>'role'<>'admin' and cardinality(ids)=0) then raise exception 'INVALID: 請指定有效組別'; end if;
   if exists(select 1 from invitations where event_id=eid and lower(email)=lower(trim(p->>'email')) and role=p->>'role' and status='pending') then raise exception 'CONFLICT: 此角色已有待接受邀請'; end if;
   if exists(select 1 from memberships m join auth.users u on u.id=m.user_id where m.event_id=eid and lower(u.email)=lower(trim(p->>'email')) and m.role=p->>'role' and m.revoked_at is null) then raise exception 'INVALID: 請先撤銷既有授權並填原因，再發新邀請'; end if;
   if p->>'role'='judge' and exists(select 1 from groups g where g.id=any(ids) and g.locked_at is not null and not exists(select 1 from memberships m join auth.users u on u.id=m.user_id where m.event_id=eid and lower(u.email)=lower(trim(p->>'email')) and m.role='judge' and g.id=any(m.group_ids))) then raise exception 'LOCKED: 晉級鎖定後不可新增評審'; end if;
   insert into invitations(event_id,email,role,group_ids,starts_at,ends_at,created_by) values(eid,lower(trim(p->>'email')),p->>'role',ids,(p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,actor) returning to_jsonb(invitations.*) into result;
  elsif action='revoke_member' then
   select * into mem from memberships where id=(p->>'membership_id')::uuid and event_id=eid;
   if mem.id is null or reason='' then raise exception 'INVALID: 請指定授權並填寫原因'; end if;
   if mem.role='admin' and actor<>ev.owner_id then raise exception 'FORBIDDEN: 僅擁有者可撤銷管理員'; end if;
   update memberships set revoked_at=now(),reason=p->>'reason' where id=mem.id;
  elsif action='revoke_invite' then
   select * into inv from invitations where id=(p->>'invitation_id')::uuid and event_id=eid for update;
   if inv.id is null or inv.status<>'pending' or reason='' then raise exception 'INVALID: 請指定待接受邀請並填寫原因'; end if;
   if inv.role='admin' and actor<>ev.owner_id then raise exception 'FORBIDDEN: 僅擁有者可撤銷管理員邀請'; end if;
   update invitations set status='revoked' where id=inv.id;
  elsif action='transfer_owner' then
   if reason='' or not exists(select 1 from memberships where event_id=eid and user_id=(p->>'user_id')::uuid and role='admin' and revoked_at is null and now() between starts_at and ends_at) then raise exception 'INVALID: 請選有效管理員並填寫原因'; end if;
   update events set owner_id=(p->>'user_id')::uuid,version=version+1 where id=eid;
  elsif action='backup' then
   result:=jsonb_build_object('schema',1,'event_id',eid,'owner_id',actor,'event',to_jsonb(ev),
    'groups',coalesce((select jsonb_agg(to_jsonb(g)) from groups g where event_id=eid),'[]'),
    'registrations',coalesce((select jsonb_agg(to_jsonb(x)) from registrations x where event_id=eid),'[]'),
    'entries',coalesce((select jsonb_agg(to_jsonb(n)) from entries n join groups g on g.id=n.group_id where g.event_id=eid),'[]'),
    'scores',coalesce((select jsonb_agg(to_jsonb(s)) from scores s join entries n on n.id=s.entry_id join groups g on g.id=n.group_id where g.event_id=eid),'[]'),
    'score_history',coalesce((select jsonb_agg(to_jsonb(h)) from score_history h join scores s on s.id=h.score_id join entries n on n.id=s.entry_id join groups g on g.id=n.group_id where g.event_id=eid),'[]'),
    'matches',coalesce((select jsonb_agg(to_jsonb(m)) from matches m join groups g on g.id=m.group_id where g.event_id=eid),'[]'),
    'votes',coalesce((select jsonb_agg(to_jsonb(v)) from votes v join matches m on m.id=v.match_id join groups g on g.id=m.group_id where g.event_id=eid),'[]'),
    'snapshots',coalesce((select jsonb_agg(to_jsonb(s)) from snapshots s where event_id=eid),'[]'),
    'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from memberships m where event_id=eid),'[]'),
    'invitations',coalesce((select jsonb_agg(to_jsonb(i)) from invitations i where event_id=eid),'[]'),
    'audit',coalesce((select jsonb_agg(to_jsonb(a)) from audit a where event_id=eid),'[]'));
  elsif action='restore' then
   if reason='' then raise exception 'INVALID: 還原需填寫原因'; end if;
   if exists(select 1 from groups where event_id=eid and locked_at is not null) or exists(select 1 from matches m join groups g on g.id=m.group_id where g.event_id=eid) then raise exception 'LOCKED: 已鎖定晉級或建立賽程，不可還原'; end if;
   if (p->'backup'->>'schema')::int<>1 or (p->'backup'->>'event_id')::uuid<>eid or (p->'backup'->>'owner_id')::uuid<>actor then raise exception 'INVALID: 備份版本、活動或擁有者不符'; end if;
   if jsonb_array_length(p->'backup'->'matches')>0 or exists(select 1 from jsonb_array_elements(p->'backup'->'groups') x where x->>'locked_at' is not null) then raise exception 'INVALID: 不可還原已鎖定的備份'; end if;
   if exists(select 1 from jsonb_array_elements(p->'backup'->'groups') x where (x->>'event_id')::uuid<>eid) or exists(select 1 from jsonb_array_elements(p->'backup'->'registrations') x where (x->>'event_id')::uuid<>eid) then raise exception 'INVALID: 備份包含其他活動資料'; end if;
   -- Preserve group IDs referenced by current permissions; only restore the same group set.
   if (select array_agg(id order by id) from groups where event_id=eid) is distinct from (select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) from jsonb_array_elements(p->'backup'->'groups') x) then raise exception 'INVALID: 備份組別與現有授權組別不符'; end if;
   -- Prevent concurrent identity allocations while restoring original receipt numbers.
   perform pg_advisory_xact_lock(9286202601);
   delete from score_history where score_id in(select s.id from scores s join entries n on n.id=s.entry_id join groups g on g.id=n.group_id where g.event_id=eid);
   delete from scores where entry_id in(select n.id from entries n join groups g on g.id=n.group_id where g.event_id=eid);
   delete from snapshots where event_id=eid;
   delete from entries where group_id in(select id from groups where event_id=eid);
   delete from registrations where event_id=eid;
   insert into registrations(id,event_id,dancer,phone,lookup_token,request_id,created_at,number) overriding system value
    select id,event_id,dancer,phone,lookup_token,request_id,created_at,number from jsonb_populate_recordset(null::registrations,p->'backup'->'registrations');
   if exists(select 1 from jsonb_array_elements(p->'backup'->'entries') x where not exists(select 1 from registrations r0 where r0.id=(x->>'registration_id')::uuid and r0.event_id=eid) or not exists(select 1 from groups g where g.id=(x->>'group_id')::uuid and g.event_id=eid)) then raise exception 'INVALID: 備份參賽資料不屬於此活動'; end if;
   insert into entries select * from jsonb_populate_recordset(null::entries,p->'backup'->'entries');
   if exists(select 1 from entries n join registrations r0 on r0.id=n.registration_id join groups g on g.id=n.group_id where r0.event_id<>g.event_id) then raise exception 'INVALID: 參賽資料歸屬不符'; end if;
   if exists(select 1 from jsonb_array_elements(p->'backup'->'scores') x where not exists(select 1 from entries n join groups g on g.id=n.group_id where n.id=(x->>'entry_id')::uuid and g.event_id=eid)) then raise exception 'INVALID: 備份分數不屬於此活動'; end if;
   insert into scores select * from jsonb_populate_recordset(null::scores,p->'backup'->'scores');
   if exists(select 1 from jsonb_array_elements(p->'backup'->'score_history') x where not exists(select 1 from scores s join entries n on n.id=s.entry_id join groups g on g.id=n.group_id where s.id=(x->>'score_id')::uuid and g.event_id=eid)) then raise exception 'INVALID: 備份評分歷程不屬於此活動'; end if;
   insert into score_history select * from jsonb_populate_recordset(null::score_history,p->'backup'->'score_history');
   update events set title=p->'backup'->'event'->>'title',city=p->'backup'->'event'->>'city',venue=p->'backup'->'event'->>'venue',
    starts_at=(p->'backup'->'event'->>'starts_at')::timestamptz,deadline=(p->'backup'->'event'->>'deadline')::timestamptz,
    registration_open=(p->'backup'->'event'->>'registration_open')::boolean,rules=p->'backup'->'event'->>'rules',dj=p->'backup'->'event'->>'dj',mc=p->'backup'->'event'->>'mc',judges=coalesce(p->'backup'->'event'->>'judges',''),version=version+1 where id=eid;
   update groups g set name=b.name,style=b.style,fee=b.fee,slots=b.slots,open=b.open,closed_at=b.closed_at,closed_by=b.closed_by,version=g.version+1
    from jsonb_populate_recordset(null::groups,p->'backup'->'groups') b where g.id=b.id and g.event_id=eid;
   perform setval(pg_get_serial_sequence('registrations','number'),greatest(coalesce((select max(number) from registrations),1),1));
  end if;
 elsif action in ('checkin','cancel_checkin','payment') then
  select * into ent from entries where id=(p->>'entry_id')::uuid and group_id=gid for update;
  if ent.id is null then raise exception 'NOT_FOUND: 找不到本組報名資料'; end if;
  if (p->>'version')::int is distinct from ent.version then raise exception 'CONFLICT: 資料已更新，請重新同步；尚未提交的輸入仍保留'; end if;
  if action<>'payment' and grp.closed_at is not null then raise exception 'CLOSED: 本組報到已結束'; end if;
  if action='cancel_checkin' and (reason='' or grp.locked_at is not null or exists(select 1 from scores where entry_id=ent.id)) then raise exception 'LOCKED: 取消須填原因，且不得已有評分或晉級鎖定'; end if;
  if action='payment' then update entries set paid=(p->>'paid')::boolean,paid_at=case when (p->>'paid')::boolean then now() else null end,version=version+1 where id=ent.id;
  else update entries set checked_at=case when action='checkin' then coalesce(checked_at,now()) else null end,version=version+1 where id=ent.id; end if;
 elsif action in ('close_checkin','reopen_checkin') then
  if action='reopen_checkin' and (reason='' or grp.locked_at is not null or exists(select 1 from scores s join entries n on n.id=s.entry_id where n.group_id=gid) or exists(select 1 from matches where group_id=gid)) then raise exception 'LOCKED: 已評分、鎖定或有賽程，不可重開；請填寫原因'; end if;
  if action='close_checkin' and grp.closed_at is not null then raise exception 'CONFLICT: 報到已結束，請重新同步'; end if;
  update groups set closed_at=case when action='close_checkin' then now() else null end,closed_by=case when action='close_checkin' then actor else null end,version=version+1 where id=gid;
 elsif action='score' then
  select * into ent from entries where id=(p->>'entry_id')::uuid and group_id=gid;
  if ent.id is null or ent.checked_at is null or grp.locked_at is not null then raise exception 'LOCKED: 僅能評本組已報到且未鎖定的舞者'; end if;
  newscore:=(p->>'score')::numeric;
  if newscore is null or newscore<0 or newscore>100 or newscore<>round(newscore,2) then raise exception 'INVALID: 分數須為 0–100，最多兩位小數'; end if;
  select * into old from scores where entry_id=ent.id and judge_id=actor for update;
  if coalesce(old.version,0) is distinct from (p->>'version')::int then raise exception 'CONFLICT: 分數已由其他裝置更新，請重新同步'; end if;
  if old.id is not null then
   if reason='' then raise exception 'INVALID: 修改分數須填寫原因'; end if;
   insert into score_history(score_id,old_score,old_comment,old_updated_at,reason,actor) values(old.id,old.score,old.comment,old.updated_at,reason,actor);
   update scores set score=newscore,comment=coalesce(p->>'comment',''),version=version+1,updated_at=now() where id=old.id;
  else insert into scores(entry_id,judge_id,score,comment) values(ent.id,actor,newscore,coalesce(p->>'comment','')); end if;
 elsif action='lock' then
  if grp.locked_at is not null then return jsonb_build_object('already_locked',true); end if;
  if grp.closed_at is null then raise exception 'INVALID: 請先結束本組報到'; end if;
  select array_agg(user_id) into judges from memberships where event_id=eid and role='judge' and gid=any(group_ids) and revoked_at is null and now() between starts_at and ends_at;
  if cardinality(judges) is null then raise exception 'INVALID: 尚未指派有效評審'; end if;
  select count(*) into total from entries where group_id=gid and checked_at is not null;
  if total<grp.slots then raise exception 'INVALID: 報到人數不足 % 人',grp.slots; end if;
  select count(*) into missing from entries n cross join unnest(judges) j where n.group_id=gid and n.checked_at is not null and not exists(select 1 from scores where entry_id=n.id and judge_id=j);
  if missing>0 then raise exception 'INVALID: 尚有 % 筆漏評',missing; end if;
  select avg(s.score) into cutoff from scores s join entries n on n.id=s.entry_id where n.group_id=gid and n.checked_at is not null and s.judge_id=any(judges) group by n.id order by avg(s.score) desc,n.id offset (grp.slots-1) limit 1;
  select avg(s.score) into following from scores s join entries n on n.id=s.entry_id where n.group_id=gid and n.checked_at is not null and s.judge_id=any(judges) group by n.id order by avg(s.score) desc,n.id offset grp.slots limit 1;
  if cutoff=following then raise exception 'TIE: 晉級截止線同分，須加賽後由原評審修分並填寫原因'; end if;
  select array_agg(id order by random()) into ids from (select n.id from entries n join scores s on s.entry_id=n.id where n.group_id=gid and n.checked_at is not null and s.judge_id=any(judges) group by n.id order by avg(s.score) desc,n.id limit grp.slots) q;
  for loop_index in 1..cardinality(ids)/2 loop insert into matches(group_id,round,position,a,b) values(gid,1,loop_index,ids[2*loop_index-1],ids[2*loop_index]); end loop;
  update groups set locked_at=now(),version=version+1,current_match=(select id from matches where group_id=gid and round=1 order by position limit 1) where id=gid;
 elsif action in ('vote','confirm_winner','set_current') then
  select * into mat from matches where id=(p->>'match_id')::uuid and group_id=gid for update;
  if mat.id is null then raise exception 'NOT_FOUND: 場次不存在'; end if;
  if action='vote' then
   if mat.id is distinct from grp.current_match or mat.winner is not null then raise exception 'LOCKED: 只可投票目前尚未確認的場次'; end if;
   win:=(p->>'entry_id')::uuid;
   if win not in (mat.a,mat.b) or win is null then raise exception 'INVALID: 只能選擇本場兩位舞者'; end if;
   select version into loop_index from votes where match_id=mat.id and judge_id=actor;
   if coalesce(loop_index,0) is distinct from (p->>'version')::int then raise exception 'CONFLICT: 票已更新，請重新同步'; end if;
   insert into votes(match_id,judge_id,entry_id) values(mat.id,actor,win) on conflict(match_id,judge_id) do update set entry_id=excluded.entry_id,version=votes.version+1;
  elsif action='set_current' then
   if mat.winner is not null then raise exception 'LOCKED: 場次已確認'; end if;
   update groups set current_match=mat.id,version=version+1 where id=gid;
  else
   if (p->>'version')::int is distinct from mat.version then raise exception 'CONFLICT: 場次已更新'; end if;
   win:=(p->>'entry_id')::uuid;
   if win not in (mat.a,mat.b) or win is null then raise exception 'INVALID: 勝方必須是本場舞者'; end if;
   if mat.winner is not null and (reason='' or exists(select 1 from matches where group_id=gid and round>mat.round)) then raise exception 'LOCKED: 更正須填原因，後續輪次已建立時不得覆寫'; end if;
   update matches set winner=win,confirmed_at=now(),version=version+1 where id=mat.id;
   update groups set current_match=(select id from matches where group_id=gid and winner is null order by round,position limit 1),version=version+1 where id=gid;
  end if;
 elsif action='next_round' then
  select max(round) into r from matches where group_id=gid;
  if r is null or exists(select 1 from matches where group_id=gid and round=r and winner is null) then raise exception 'INVALID: 請先確認本輪所有勝方'; end if;
  select array_agg(winner order by position) into ids from matches where group_id=gid and round=r;
  if cardinality(ids)=1 then raise exception 'LOCKED: 冠軍已產生，不再建立輪次'; end if;
  for loop_index in 1..cardinality(ids)/2 loop insert into matches(group_id,round,position,a,b) values(gid,r+1,loop_index,ids[2*loop_index-1],ids[2*loop_index]); end loop;
  update groups set version=version+1,current_match=(select id from matches where group_id=gid and round=r+1 order by position limit 1) where id=gid;
 elsif action='publish' then
  if grp.locked_at is null then raise exception 'INVALID: 尚未鎖定晉級'; end if;
  result:=jsonb_build_object('event_title',ev.title,'group_name',grp.name,'current_match',grp.current_match,
   'dancers',(select jsonb_agg(jsonb_build_object('id',n.id,'dancer',r0.dancer,'number',r0.number)) from entries n join registrations r0 on r0.id=n.registration_id where n.id in(select a from matches where group_id=gid and round=1 union select b from matches where group_id=gid and round=1)),
   'matches',(select jsonb_agg(jsonb_build_object('id',id,'round',round,'position',position,'a',a,'b',b,'winner',winner) order by round,position) from matches where group_id=gid));
  insert into snapshots(group_id,event_id,published,payload) values(gid,eid,true,result) on conflict(group_id) do update set published=true,payload=excluded.payload,published_at=now();
  update groups set version=version+1 where id=gid;
 elsif action='pause' then
  update snapshots set published=false where group_id=gid;
  update groups set version=version+1 where id=gid;
 else raise exception 'INVALID: 不支援的操作';
 end if;
 insert into audit(event_id,actor,action,payload) values(eid,actor,action,p - 'backup' - 'phone' - 'comment');
 return result;
end $$;

revoke all on function public.can_access(uuid,text[],uuid), public.event_public(events), public.browse_events(), public.live_snapshot(uuid), public.register_dancer(jsonb,text), public.workspace(), public.command(text,jsonb) from public,anon,authenticated;
grant execute on function public.browse_events(),public.live_snapshot(uuid) to anon,authenticated;
grant execute on function public.workspace(),public.command(text,jsonb) to authenticated;
grant execute on function public.register_dancer(jsonb,text) to service_role;
