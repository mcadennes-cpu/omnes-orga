-- ============================================================================
-- Module Discussion — fondations (étape 7A)
-- ----------------------------------------------------------------------------
-- 6 tables : boards, board_members, cards, messages, attachments, card_reads
-- RLS + helper functions + trigger last_activity_at + bucket Storage + Realtime
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table public.discussion_boards (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  color           text not null default 'brique'
                    check (color in ('brique', 'canard', 'ocre', 'olive', 'fuchsia', 'marine')),
  created_by      uuid not null references public.profiles(id) on delete restrict,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.discussion_board_members (
  board_id        uuid not null references public.discussion_boards(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member'
                    check (role in ('owner', 'member')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (board_id, user_id)
);

create table public.discussion_cards (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references public.discussion_boards(id) on delete cascade,
  title             text not null,
  description       text,
  status            text not null default 'open'
                      check (status in ('open', 'closed')),
  archived          boolean not null default false,
  created_by        uuid not null references public.profiles(id) on delete restrict,
  closed_by         uuid references public.profiles(id) on delete set null,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now()
);

create table public.discussion_messages (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.discussion_cards(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete restrict,
  body        text,
  edited_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table public.discussion_attachments (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid references public.discussion_cards(id) on delete cascade,
  message_id    uuid references public.discussion_messages(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  size_bytes    bigint not null,
  mime_type     text,
  uploaded_by   uuid not null references public.profiles(id) on delete restrict,
  uploaded_at   timestamptz not null default now(),
  check (card_id is not null or message_id is not null)
);

create table public.discussion_card_reads (
  card_id       uuid not null references public.discussion_cards(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (card_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. Index
-- ----------------------------------------------------------------------------

create index idx_discussion_boards_created_by      on public.discussion_boards(created_by);
create index idx_discussion_boards_archived        on public.discussion_boards(archived);
create index idx_discussion_board_members_user     on public.discussion_board_members(user_id);
create index idx_discussion_cards_board            on public.discussion_cards(board_id);
create index idx_discussion_cards_last_activity    on public.discussion_cards(last_activity_at desc);
create index idx_discussion_cards_status           on public.discussion_cards(status);
create index idx_discussion_messages_card_created  on public.discussion_messages(card_id, created_at);
create index idx_discussion_attachments_card       on public.discussion_attachments(card_id);
create index idx_discussion_attachments_message    on public.discussion_attachments(message_id);

-- ----------------------------------------------------------------------------
-- 3. Trigger : last_activity_at sur insert message
-- ----------------------------------------------------------------------------

create or replace function public.discussion_touch_card_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.discussion_cards
     set last_activity_at = now()
   where id = new.card_id;
  return new;
end;
$$;

create trigger discussion_messages_touch_card
  after insert on public.discussion_messages
  for each row
  execute function public.discussion_touch_card_activity();

-- ----------------------------------------------------------------------------
-- 4. Helpers pour les RLS
-- ----------------------------------------------------------------------------

create or replace function public.is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
      from public.discussion_board_members
     where board_id = p_board_id
       and user_id = auth.uid()
  );
$$;

create or replace function public.is_board_owner(p_board_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
      from public.discussion_board_members
     where board_id = p_board_id
       and user_id = auth.uid()
       and role = 'owner'
  );
$$;

create or replace function public.can_create_discussion_board()
returns boolean
language sql
stable
security definer
as $$
  select public.current_user_role()::text in ('associe', 'associe_gerant', 'super_admin');
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.discussion_boards         enable row level security;
alter table public.discussion_board_members  enable row level security;
alter table public.discussion_cards          enable row level security;
alter table public.discussion_messages       enable row level security;
alter table public.discussion_attachments    enable row level security;
alter table public.discussion_card_reads     enable row level security;

-- discussion_boards
create policy discussion_boards_select on public.discussion_boards
  for select using (public.is_board_member(id));

create policy discussion_boards_insert on public.discussion_boards
  for insert with check (
    public.can_create_discussion_board()
    and created_by = auth.uid()
  );

create policy discussion_boards_update on public.discussion_boards
  for update using (
    public.is_board_owner(id)
    or public.current_user_role()::text = 'super_admin'
  );

create policy discussion_boards_delete on public.discussion_boards
  for delete using (public.current_user_role()::text = 'super_admin');

-- discussion_board_members
create policy discussion_board_members_select on public.discussion_board_members
  for select using (public.is_board_member(board_id));

create policy discussion_board_members_insert on public.discussion_board_members
  for insert with check (
    public.is_board_owner(board_id)
    or public.current_user_role()::text = 'super_admin'
    or (
      -- à la création du tableau, l'auteur s'ajoute comme owner
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.discussion_boards b
         where b.id = board_id and b.created_by = auth.uid()
      )
    )
  );

create policy discussion_board_members_delete on public.discussion_board_members
  for delete using (
    public.is_board_owner(board_id)
    or public.current_user_role()::text = 'super_admin'
    or user_id = auth.uid()  -- quitter le tableau
  );

-- discussion_cards
create policy discussion_cards_select on public.discussion_cards
  for select using (public.is_board_member(board_id));

create policy discussion_cards_insert on public.discussion_cards
  for insert with check (
    public.is_board_member(board_id)
    and public.current_user_role()::text in ('associe', 'associe_gerant', 'super_admin')
    and created_by = auth.uid()
  );

create policy discussion_cards_update on public.discussion_cards
  for update using (
    public.is_board_member(board_id)
    and (
      created_by = auth.uid()
      or public.is_board_owner(board_id)
      or public.current_user_role()::text = 'super_admin'
    )
  );

create policy discussion_cards_delete on public.discussion_cards
  for delete using (
    created_by = auth.uid()
    or public.is_board_owner(board_id)
    or public.current_user_role()::text = 'super_admin'
  );

-- discussion_messages
create policy discussion_messages_select on public.discussion_messages
  for select using (
    exists (
      select 1 from public.discussion_cards c
       where c.id = card_id and public.is_board_member(c.board_id)
    )
  );

create policy discussion_messages_insert on public.discussion_messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.discussion_cards c
       where c.id = card_id
         and public.is_board_member(c.board_id)
         and c.status = 'open'
    )
  );

create policy discussion_messages_update on public.discussion_messages
  for update using (author_id = auth.uid());

create policy discussion_messages_delete on public.discussion_messages
  for delete using (author_id = auth.uid());

-- discussion_attachments
create policy discussion_attachments_select on public.discussion_attachments
  for select using (
    (card_id is not null and exists (
      select 1 from public.discussion_cards c
       where c.id = card_id and public.is_board_member(c.board_id)
    ))
    or (message_id is not null and exists (
      select 1 from public.discussion_messages m
        join public.discussion_cards c on c.id = m.card_id
       where m.id = message_id and public.is_board_member(c.board_id)
    ))
  );

create policy discussion_attachments_insert on public.discussion_attachments
  for insert with check (
    uploaded_by = auth.uid()
    and (
      (card_id is not null and exists (
        select 1 from public.discussion_cards c
         where c.id = card_id and public.is_board_member(c.board_id)
      ))
      or (message_id is not null and exists (
        select 1 from public.discussion_messages m
          join public.discussion_cards c on c.id = m.card_id
         where m.id = message_id and public.is_board_member(c.board_id)
      ))
    )
  );

create policy discussion_attachments_delete on public.discussion_attachments
  for delete using (uploaded_by = auth.uid());

-- discussion_card_reads
create policy discussion_card_reads_all on public.discussion_card_reads
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Storage bucket
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('discussion-attachments', 'discussion-attachments', false)
on conflict (id) do nothing;

create policy "discussion_attachments_storage_select" on storage.objects
  for select using (
    bucket_id = 'discussion-attachments'
    and exists (
      select 1 from public.discussion_attachments a
       where a.storage_path = name
         and (
           (a.card_id is not null and exists (
             select 1 from public.discussion_cards c
              where c.id = a.card_id and public.is_board_member(c.board_id)
           ))
           or (a.message_id is not null and exists (
             select 1 from public.discussion_messages m
               join public.discussion_cards c on c.id = m.card_id
              where m.id = a.message_id and public.is_board_member(c.board_id)
           ))
         )
    )
  );

create policy "discussion_attachments_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'discussion-attachments'
    and auth.uid() is not null
  );

create policy "discussion_attachments_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'discussion-attachments'
    and exists (
      select 1 from public.discussion_attachments a
       where a.storage_path = name and a.uploaded_by = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Realtime
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.discussion_messages;
alter publication supabase_realtime add table public.discussion_cards;
