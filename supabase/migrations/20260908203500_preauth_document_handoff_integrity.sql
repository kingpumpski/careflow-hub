-- Authorization-request document registration and email-handoff integrity.
-- This boundary prepares artifacts only; it does not send or submit to insurers.

create table if not exists public.preauth_document_registry (
  id uuid primary key default gen_random_uuid(),
  preauth_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  document_name text not null,
  document_format text not null default 'pdf' check (document_format = 'pdf'),
  status text not null default 'prepared' check (status in ('prepared','superseded')),
  created_by uuid not null references auth.users(id),
  facility_id uuid not null,
  created_at timestamptz not null default now(),
  unique (preauth_id, version_number),
  foreign key (preauth_id, version_number)
    references public.preauthorization_versions(preauth_id, version_number)
    on delete restrict
);

create index if not exists idx_preauth_document_registry_facility_created
  on public.preauth_document_registry(facility_id, created_at desc);
create index if not exists idx_preauth_document_registry_revision
  on public.preauth_document_registry(preauth_id, version_number);

alter table public.preauth_document_registry enable row level security;
revoke insert, update, delete on public.preauth_document_registry from authenticated;
grant select on public.preauth_document_registry to authenticated;

drop policy if exists preauth_document_registry_select on public.preauth_document_registry;
create policy preauth_document_registry_select on public.preauth_document_registry
for select to authenticated
using (
  security_internal.user_has_facility_access(facility_id)
  and security_internal.current_user_has_permission('preauth.read')
);

create table if not exists public.preauth_handoff_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.preauth_document_registry(id) on delete restrict,
  preauth_id uuid not null,
  version_number integer not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null,
  recipients jsonb not null,
  subject text not null,
  message_body text not null,
  attachment_name text not null,
  prepared_by uuid not null references auth.users(id),
  facility_id uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, idempotency_key),
  foreign key (preauth_id, version_number)
    references public.preauthorization_versions(preauth_id, version_number)
    on delete restrict
);

create index if not exists idx_preauth_handoff_log_facility_created
  on public.preauth_handoff_log(facility_id, created_at desc);
create index if not exists idx_preauth_handoff_log_document
  on public.preauth_handoff_log(document_id, created_at desc);

alter table public.preauth_handoff_log enable row level security;
revoke insert, update, delete on public.preauth_handoff_log from authenticated;
grant select on public.preauth_handoff_log to authenticated;

drop policy if exists preauth_handoff_log_select on public.preauth_handoff_log;
create policy preauth_handoff_log_select on public.preauth_handoff_log
for select to authenticated
using (
  security_internal.user_has_facility_access(facility_id)
  and security_internal.current_user_has_permission('preauth.read')
);

create or replace function security_internal.register_preauth_document(
  p_preauth_id uuid,
  p_version_number integer,
  p_snapshot jsonb,
  p_document_name text,
  p_facility_id uuid
)
returns public.preauth_document_registry
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_revision public.preauthorization_versions%rowtype;
  v_existing public.preauth_document_registry%rowtype;
  v_hash text;
  v_result public.preauth_document_registry;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PREAUTH_WRITE_REQUIRED' using errcode = '42501'; end if;
  if not security_internal.user_has_facility_access(p_facility_id) then raise exception 'FACILITY_ACCESS_DENIED' using errcode = '42501'; end if;
  select * into v_revision from public.preauthorization_versions where preauth_id=p_preauth_id and version_number=p_version_number and facility_id=p_facility_id;
  if not found then raise exception 'PREAUTH_REVISION_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_snapshot is distinct from v_revision.snapshot then raise exception 'PREAUTH_FROZEN_SNAPSHOT_MISMATCH' using errcode = 'P0001'; end if;
  v_hash := encode(extensions.digest(convert_to(p_snapshot::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.preauth_document_registry where preauth_id=p_preauth_id and version_number=p_version_number for update;
  if found then
    if v_existing.snapshot_hash <> v_hash or v_existing.snapshot is distinct from p_snapshot or v_existing.document_name <> p_document_name or v_existing.facility_id <> p_facility_id then
      raise exception 'PREAUTH_DOCUMENT_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing;
  end if;
  insert into public.preauth_document_registry(preauth_id,version_number,snapshot,snapshot_hash,document_name,document_format,status,created_by,facility_id)
  values(p_preauth_id,p_version_number,p_snapshot,v_hash,p_document_name,'pdf','prepared',v_uid,p_facility_id)
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function security_internal.register_preauth_document(uuid,integer,jsonb,text,uuid) from public, anon;
grant execute on function security_internal.register_preauth_document(uuid,integer,jsonb,text,uuid) to authenticated;

create or replace function public.register_preauth_document(uuid,integer,jsonb,text,uuid)
returns public.preauth_document_registry
language sql security invoker set search_path = ''
as $$ select security_internal.register_preauth_document($1,$2,$3,$4,$5); $$;
revoke all on function public.register_preauth_document(uuid,integer,jsonb,text,uuid) from public, anon;
grant execute on function public.register_preauth_document(uuid,integer,jsonb,text,uuid) to authenticated;

create or replace function security_internal.prepare_preauth_handoff(
  p_document_id uuid,
  p_snapshot_hash text,
  p_idempotency_key text,
  p_recipients jsonb,
  p_subject text,
  p_message_body text,
  p_attachment_name text
)
returns public.preauth_handoff_log
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.preauth_document_registry%rowtype;
  v_existing public.preauth_handoff_log%rowtype;
  v_result public.preauth_handoff_log;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not security_internal.current_user_has_permission('preauth.write') then raise exception 'PREAUTH_WRITE_REQUIRED' using errcode='42501'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8 or length(p_idempotency_key) > 200 then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
  if p_snapshot_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_SNAPSHOT_HASH' using errcode='22023'; end if;
  select * into v_doc from public.preauth_document_registry where id=p_document_id for update;
  if not found then raise exception 'PREAUTH_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;
  if not security_internal.user_has_facility_access(v_doc.facility_id) then raise exception 'FACILITY_ACCESS_DENIED' using errcode='42501'; end if;
  if v_doc.snapshot_hash <> p_snapshot_hash then raise exception 'PREAUTH_HANDOFF_SNAPSHOT_MISMATCH' using errcode='P0001'; end if;
  if jsonb_typeof(p_recipients) <> 'array' or jsonb_array_length(p_recipients)=0 then raise exception 'HANDOFF_RECIPIENTS_REQUIRED' using errcode='22023'; end if;
  select * into v_existing from public.preauth_handoff_log where document_id=p_document_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.snapshot_hash <> p_snapshot_hash or v_existing.recipients is distinct from p_recipients or v_existing.subject is distinct from p_subject or v_existing.message_body is distinct from p_message_body or v_existing.attachment_name is distinct from p_attachment_name then
      raise exception 'PREAUTH_HANDOFF_CONFLICT' using errcode='P0001';
    end if;
    return v_existing;
  end if;
  insert into public.preauth_handoff_log(document_id,preauth_id,version_number,snapshot_hash,idempotency_key,recipients,subject,message_body,attachment_name,prepared_by,facility_id)
  values(v_doc.id,v_doc.preauth_id,v_doc.version_number,v_doc.snapshot_hash,p_idempotency_key,p_recipients,p_subject,p_message_body,p_attachment_name,v_uid,v_doc.facility_id)
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function security_internal.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) from public, anon;
grant execute on function security_internal.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) to authenticated;

create or replace function public.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text)
returns public.preauth_handoff_log
language sql security invoker set search_path = ''
as $$ select security_internal.prepare_preauth_handoff($1,$2,$3,$4,$5,$6,$7); $$;
revoke all on function public.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) from public, anon;
grant execute on function public.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) to authenticated;

comment on function public.prepare_preauth_handoff(uuid,text,text,jsonb,text,text,text) is 'Prepares an authorization-request email handoff package only; does not send, submit, or report insurer delivery.';
