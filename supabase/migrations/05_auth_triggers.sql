-- ============================================================================
-- 05_auth_triggers.sql
-- Lógica de alta de usuario: fusión de perfiles temporales por token/email,
-- unión a grupos vía invitación, y trigger sobre auth.users.
-- Consolidado desde 0001 (§9) — estado final. Depende de 01_core_schema.sql
-- y 02_notifications_and_managed_users.sql (usa public.notifications).
-- ============================================================================

create or replace function public.claim_temp_profile(temp_id uuid, real_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if temp_id is null or temp_id = real_id then
    return;
  end if;

  update public.group_members set user_id = real_id where user_id = temp_id
    and not exists (
      select 1 from public.group_members gm2
      where gm2.group_id = group_members.group_id and gm2.user_id = real_id
    );
  delete from public.group_members where user_id = temp_id;

  update public.group_members set invited_by = real_id where invited_by = temp_id;
  update public.groups set owner_id = real_id where owner_id = temp_id;
  update public.expenses set paid_by = real_id where paid_by = temp_id;
  update public.expenses set created_by = real_id where created_by = temp_id;

  update public.expense_splits set user_id = real_id where user_id = temp_id
    and not exists (
      select 1 from public.expense_splits es2
      where es2.expense_id = expense_splits.expense_id and es2.user_id = real_id
    );
  delete from public.expense_splits where user_id = temp_id;

  update public.payments set paid_by = real_id where paid_by = temp_id;
  update public.payments set paid_to = real_id where paid_to = temp_id;
  update public.notifications set user_id = real_id where user_id = temp_id;
  update public.group_invites set invitee_profile_id = real_id where invitee_profile_id = temp_id;

  delete from public.profiles where id = temp_id and is_temp = true;
end;
$$;

create or replace function public.claim_and_join_group(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_group record;
  v_target_group_id uuid;
  v_user_email text;
  v_temp record;
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'ID de usuario requerido');
  end if;

  -- 1. Obtener email del usuario real
  select email into v_user_email from public.profiles where id = p_user_id;
  if v_user_email is null then
    select email into v_user_email from auth.users where id = p_user_id;
  end if;

  -- 2. Buscar invitación por token o por id
  select * into v_invite from public.group_invites
  where token::text = p_token or id::text = p_token
  limit 1;

  if v_invite.id is not null then
    v_target_group_id := v_invite.group_id;

    -- Si la invitación tenía un perfil temporal asignado, reclamarlo de inmediato
    if v_invite.invitee_profile_id is not null and v_invite.invitee_profile_id <> p_user_id then
      perform public.claim_temp_profile(v_invite.invitee_profile_id, p_user_id);
    end if;

    -- Si era una invitación individual, marcar como aceptada
    if v_invite.invitee_profile_id is not null or (v_invite.email is not null and v_invite.email <> 'invite@link.deudita.app') then
      update public.group_invites
      set status = 'accepted', invitee_profile_id = p_user_id
      where id = v_invite.id;
    end if;
  else
    -- Si p_token es el id directo de un grupo
    begin
      select * into v_group from public.groups where id = p_token::uuid;
      if v_group.id is not null then
        v_target_group_id := v_group.id;
      end if;
    exception when others then
      v_target_group_id := null;
    end;
  end if;

  -- 3. Reclamar cualquier otro perfil temporal con el mismo email
  if v_user_email is not null and length(trim(v_user_email)) > 3 then
    for v_temp in
      select id from public.profiles
      where is_temp = true and lower(trim(email)) = lower(trim(v_user_email)) and id <> p_user_id
    loop
      perform public.claim_temp_profile(v_temp.id, p_user_id);
    end loop;
  end if;

  -- 4. Si encontramos el grupo objetivo, asegurar membresía
  if v_target_group_id is not null then
    insert into public.group_members (group_id, user_id, invited_by, role)
    values (v_target_group_id, p_user_id, coalesce(v_invite.invited_by, p_user_id), 'member')
    on conflict (group_id, user_id) do nothing;

    select name into v_group from public.groups where id = v_target_group_id;

    -- Crear notificación
    insert into public.notifications (user_id, type, title, message, data)
    values (
      p_user_id,
      'group_invite',
      '¡Te has unido al grupo!',
      'Te has unido exitosamente al grupo ' || coalesce(v_group.name, 'Grupo') || '.',
      jsonb_build_object('group_id', v_target_group_id, 'invite_id', v_invite.id)
    );

    return jsonb_build_object(
      'success', true,
      'group_id', v_target_group_id,
      'group_name', coalesce(v_group.name, 'Grupo'),
      'message', 'Te has unido exitosamente al grupo'
    );
  end if;

  -- 5. Si no se especificó un token válido, pero el usuario ya tenía membresías
  select group_id into v_target_group_id from public.group_members where user_id = p_user_id limit 1;
  if v_target_group_id is not null then
    select name into v_group from public.groups where id = v_target_group_id;
    return jsonb_build_object(
      'success', true,
      'group_id', v_target_group_id,
      'group_name', coalesce(v_group.name, 'Grupo'),
      'message', 'Ya formas parte del grupo'
    );
  end if;

  return jsonb_build_object('success', false, 'error', 'No se encontró la invitación o grupo');
end;
$$;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  invite_token uuid;
  inv record;
begin
  invite_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;

  insert into public.profiles (id, email, full_name, avatar_url, is_temp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    false
  )
  on conflict (id) do nothing;

  for inv in
    select distinct on (gi.invitee_profile_id, gi.id)
      gi.id as invite_id, gi.group_id, gi.invited_by, gi.invitee_profile_id, g.name as group_name
    from public.group_invites gi
    join public.groups g on g.id = gi.group_id
    where gi.status = 'pending'
      and (
        (invite_token is not null and gi.token = invite_token)
        or (new.email is not null and gi.email = new.email)
      )
  loop
    if inv.invitee_profile_id is not null then
      perform public.claim_temp_profile(inv.invitee_profile_id, new.id);
    else
      insert into public.group_members (group_id, user_id, invited_by)
      values (inv.group_id, new.id, inv.invited_by)
      on conflict (group_id, user_id) do nothing;
    end if;

    update public.group_invites set status = 'accepted' where id = inv.invite_id;

    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.id, 'group_invite', '¡Te has unido al grupo!',
      'Te has unido exitosamente al grupo ' || inv.group_name || '.',
      jsonb_build_object('group_id', inv.group_id, 'invite_id', inv.invite_id)
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
