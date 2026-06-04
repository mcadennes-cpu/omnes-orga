-- ============================================================================
-- Module Discussion - Sondages (etape 16 ter, phase A)
-- ----------------------------------------------------------------------------
-- 3 tables : discussion_polls, discussion_poll_options, discussion_poll_votes
-- + 4 fonctions helper SECURITY DEFINER + RLS (13 policies) + 3 index
-- Convention : noms anglais (aligne sur Discussion), pas de updated_at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- Un sondage par carte (contrainte UNIQUE sur card_id).
create table public.discussion_polls (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null unique references public.discussion_cards(id) on delete cascade,
  question    text not null,
  closed      boolean not null default false,
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

-- Les choix proposes par un sondage.
create table public.discussion_poll_options (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.discussion_polls(id) on delete cascade,
  label       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Un vote = le choix d'un utilisateur sur un sondage.
-- UNIQUE (poll_id, user_id) : une seule reponse par personne -> permet l'upsert
-- (changer d'avis remplace la ligne au lieu d'en creer une seconde).
create table public.discussion_poll_votes (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.discussion_polls(id) on delete cascade,
  option_id   uuid not null references public.discussion_poll_options(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (poll_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. Index
-- ----------------------------------------------------------------------------

create index idx_discussion_poll_options_poll on public.discussion_poll_options(poll_id);
create index idx_discussion_poll_votes_poll   on public.discussion_poll_votes(poll_id);
create index idx_discussion_poll_votes_option on public.discussion_poll_votes(option_id);
-- card_id (polls) et (poll_id, user_id) (votes) sont deja indexes par leurs UNIQUE.

-- ----------------------------------------------------------------------------
-- 3. Helpers RLS (SECURITY DEFINER, sur le modele de is_board_member)
-- ----------------------------------------------------------------------------

-- Peut gerer le contenu d'une carte (creer un sondage dessus) :
-- createur de la carte, owner du tableau, ou super_admin. Keyee par card_id.
create or replace function public.can_manage_discussion_card(p_card_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.discussion_cards c
     where c.id = p_card_id
       and (
         c.created_by = auth.uid()
         or public.is_board_owner(c.board_id)
         or public.current_user_role()::text = 'super_admin'
       )
  );
$$;

-- Est membre du tableau parent du sondage (lecture options/votes). Keyee par poll_id.
create or replace function public.is_discussion_poll_member(p_poll_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
      from public.discussion_polls p
      join public.discussion_cards c on c.id = p.card_id
     where p.id = p_poll_id and public.is_board_member(c.board_id)
  );
$$;

-- Peut gerer un sondage existant (editer question, options, cloturer, supprimer).
-- Meme regle que can_manage_discussion_card mais keyee par poll_id, car les
-- options/votes n'ont pas le card_id sous la main.
create or replace function public.can_manage_discussion_poll(p_poll_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
      from public.discussion_polls p
      join public.discussion_cards c on c.id = p.card_id
     where p.id = p_poll_id
       and (
         c.created_by = auth.uid()
         or public.is_board_owner(c.board_id)
         or public.current_user_role()::text = 'super_admin'
       )
  );
$$;

-- Le sondage accepte-t-il un vote maintenant ? membre ET sondage ouvert ET
-- carte ouverte. Sert aux policies INSERT/UPDATE des votes.
create or replace function public.is_discussion_poll_votable(p_poll_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
      from public.discussion_polls p
      join public.discussion_cards c on c.id = p.card_id
     where p.id = p_poll_id
       and p.closed = false
       and c.status = 'open'
       and public.is_board_member(c.board_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------

alter table public.discussion_polls        enable row level security;
alter table public.discussion_poll_options enable row level security;
alter table public.discussion_poll_votes   enable row level security;

-- --- discussion_polls -------------------------------------------------------

create policy discussion_polls_select on public.discussion_polls
  for select using (
    exists (
      select 1 from public.discussion_cards c
       where c.id = card_id and public.is_board_member(c.board_id)
    )
  );

create policy discussion_polls_insert on public.discussion_polls
  for insert with check (
    created_by = auth.uid()
    and public.can_manage_discussion_card(card_id)
    and exists (
      select 1 from public.discussion_cards c
       where c.id = card_id and c.status = 'open'
    )
  );

create policy discussion_polls_update on public.discussion_polls
  for update using (public.can_manage_discussion_card(card_id));

create policy discussion_polls_delete on public.discussion_polls
  for delete using (public.can_manage_discussion_card(card_id));

-- --- discussion_poll_options ------------------------------------------------

create policy discussion_poll_options_select on public.discussion_poll_options
  for select using (public.is_discussion_poll_member(poll_id));

create policy discussion_poll_options_insert on public.discussion_poll_options
  for insert with check (
    public.can_manage_discussion_poll(poll_id)
    and exists (select 1 from public.discussion_polls p where p.id = poll_id and p.closed = false)
  );

create policy discussion_poll_options_update on public.discussion_poll_options
  for update using (
    public.can_manage_discussion_poll(poll_id)
    and exists (select 1 from public.discussion_polls p where p.id = poll_id and p.closed = false)
  );

create policy discussion_poll_options_delete on public.discussion_poll_options
  for delete using (
    public.can_manage_discussion_poll(poll_id)
    and exists (select 1 from public.discussion_polls p where p.id = poll_id and p.closed = false)
  );

-- --- discussion_poll_votes --------------------------------------------------

create policy discussion_poll_votes_select on public.discussion_poll_votes
  for select using (public.is_discussion_poll_member(poll_id));

create policy discussion_poll_votes_insert on public.discussion_poll_votes
  for insert with check (
    user_id = auth.uid()
    and public.is_discussion_poll_votable(poll_id)
    and exists (
      select 1 from public.discussion_poll_options o
       where o.id = option_id and o.poll_id = poll_id
    )
  );

create policy discussion_poll_votes_update on public.discussion_poll_votes
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_discussion_poll_votable(poll_id)
    and exists (
      select 1 from public.discussion_poll_options o
       where o.id = option_id and o.poll_id = poll_id
    )
  );

create policy discussion_poll_votes_delete on public.discussion_poll_votes
  for delete using (user_id = auth.uid());
