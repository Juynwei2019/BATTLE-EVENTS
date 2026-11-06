-- A separate committed call retains failed attempts too; never grant to browsers.
create function public.consume_registration_limit(fingerprint text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
 if fingerprint is null or length(fingerprint)<32 then return false; end if;
 perform pg_advisory_xact_lock(hashtext(fingerprint));
 delete from registration_attempts where created_at<now()-interval '1 hour';
 select count(*) into n from registration_attempts a where a.fingerprint=consume_registration_limit.fingerprint and created_at>now()-interval '1 minute';
 if n>=10 then return false; end if;
 insert into registration_attempts values(fingerprint,now());
 return true;
end $$;
revoke all on function public.consume_registration_limit(text) from public,anon,authenticated;
grant execute on function public.consume_registration_limit(text) to service_role;
