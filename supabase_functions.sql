-- Trigger to automatically create a public.User entry when a new auth.users entry is created using Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public."User" (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

-- Trigger to automatically delete a public.User entry when settings in auth.users is deleted
create or replace function public.handle_user_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public."User" where id = old.id;
  return old;
end;
$$;

-- Bind the insertion trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bind the deletion trigger
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute procedure public.handle_user_delete();
