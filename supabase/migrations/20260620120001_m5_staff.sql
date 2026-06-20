-- is_staff is set only via service role / direct SQL — never self-promoted via API
alter table profiles add column if not exists is_staff boolean not null default false;
comment on column profiles.is_staff is 'Set only via service-role or direct SQL. Never self-promotable via API.';
