alter table public.sessions
  add column if not exists share_expires_at timestamptz;

alter policy sessions_admin_insert on public.sessions
  with check (
    is_admin()
    and created_by = auth.uid()
    and status = 'waiting'
    and expires_at > now()
    and expires_at <= now() + interval '30 days 1 minute'
  );

create or replace function public.join_start(t text, n text, ua text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c int;
begin
  update public.sessions
  set status = 'live',
      participant_name = left(coalesce(nullif(trim(n), ''), 'Participant'), 40),
      consent_at = now(),
      started_at = now(),
      share_expires_at = least(expires_at, now() + interval '60 minutes'),
      last_seen = now(),
      user_agent = left(ua, 120)
  where token = t and status = 'waiting' and expires_at > now();
  get diagnostics c = row_count;
  return c = 1;
end
$function$;

create or replace function public.join_heartbeat(t text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  live_deadline timestamptz;
begin
  select status, expires_at, share_expires_at, started_at, last_seen
  into s
  from public.sessions
  where token = t;

  if not found then
    return 'ended';
  end if;

  live_deadline := coalesce(
    s.share_expires_at,
    s.started_at + interval '60 minutes',
    s.expires_at
  );

  if s.status = 'live' and (s.expires_at <= now() or live_deadline <= now()) then
    update public.sessions
    set status = 'ended', ended_at = now(), ended_by = 'expired'
    where token = t and status = 'live';
    return 'ended';
  end if;

  if s.status = 'live' and (s.last_seen is null or s.last_seen < now() - interval '2 seconds') then
    update public.sessions set last_seen = now() where token = t;
  end if;

  return s.status;
end
$function$;
