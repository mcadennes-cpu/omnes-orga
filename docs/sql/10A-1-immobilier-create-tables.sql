-- =============================================================
-- 10A-1 : Module Immobilier — creation des tables
-- =============================================================
-- 6 tables : boards, board_members, cards, messages, attachments, card_reads
-- Calque sur le module Discussion, prefixe immobilier_
-- Pas de RLS ici (10A-3), pas de Storage (10A-4), pas de Realtime (10A-5)
-- =============================================================

-- ---------- Fonction handle_updated_at (idempotent) -----------
-- Cree la fonction seulement si elle n'existe pas deja
-- (elle existe depuis Cabinet pratique, mais on la redeclare
-- en CREATE OR REPLACE pour qu'on puisse rejouer ce script
-- sur un environnement neuf si besoin)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- Table immobilier_boards ---------------------------
CREATE TABLE public.immobilier_boards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           text NOT NULL,
  description     text,
  couleur         text NOT NULL DEFAULT 'canard'
                  CHECK (couleur IN ('brique','canard','ocre','olive','fuchsia','marine')),
  archive         boolean NOT NULL DEFAULT false,
  auteur_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_immobilier_boards_archive ON public.immobilier_boards(archive);
CREATE INDEX idx_immobilier_boards_last_activity ON public.immobilier_boards(last_activity_at DESC);

CREATE TRIGGER trg_immobilier_boards_updated_at
  BEFORE UPDATE ON public.immobilier_boards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------- Table immobilier_board_members --------------------
-- Lien membre <-> tableau. role_in_board = 'owner' ou 'member'.
-- last_read_at sert au point colore "ce tableau a du nouveau".
CREATE TABLE public.immobilier_board_members (
  board_id      uuid NOT NULL REFERENCES public.immobilier_boards(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_board text NOT NULL DEFAULT 'member'
                CHECK (role_in_board IN ('owner','member')),
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX idx_immobilier_board_members_user ON public.immobilier_board_members(user_id);

-- ---------- Table immobilier_cards ----------------------------
CREATE TABLE public.immobilier_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         uuid NOT NULL REFERENCES public.immobilier_boards(id) ON DELETE CASCADE,
  titre            text NOT NULL,
  description      text,
  statut           text NOT NULL DEFAULT 'ouvert'
                   CHECK (statut IN ('ouvert','clos')),
  archive          boolean NOT NULL DEFAULT false,
  auteur_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_immobilier_cards_board ON public.immobilier_cards(board_id);
CREATE INDEX idx_immobilier_cards_statut ON public.immobilier_cards(statut);
CREATE INDEX idx_immobilier_cards_last_activity ON public.immobilier_cards(last_activity_at DESC);

CREATE TRIGGER trg_immobilier_cards_updated_at
  BEFORE UPDATE ON public.immobilier_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------- Table immobilier_messages -------------------------
CREATE TABLE public.immobilier_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid NOT NULL REFERENCES public.immobilier_cards(id) ON DELETE CASCADE,
  auteur_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contenu     text NOT NULL,
  edited      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_immobilier_messages_card ON public.immobilier_messages(card_id);
CREATE INDEX idx_immobilier_messages_created ON public.immobilier_messages(created_at);

CREATE TRIGGER trg_immobilier_messages_updated_at
  BEFORE UPDATE ON public.immobilier_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger : remonte la carte et le tableau quand un message est poste
CREATE OR REPLACE FUNCTION public.bump_immobilier_card_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.immobilier_cards
    SET last_activity_at = NEW.created_at
    WHERE id = NEW.card_id;

  UPDATE public.immobilier_boards
    SET last_activity_at = NEW.created_at
    WHERE id = (SELECT board_id FROM public.immobilier_cards WHERE id = NEW.card_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_immobilier_messages_bump_activity
  AFTER INSERT ON public.immobilier_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_immobilier_card_activity();

-- ---------- Table immobilier_attachments ----------------------
-- L'id UUID sert aussi de nom physique du blob dans le bucket
-- immobilier-attachments (pattern flat UUID identique a Cabinet/SIM).
CREATE TABLE public.immobilier_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       uuid NOT NULL REFERENCES public.immobilier_cards(id) ON DELETE CASCADE,
  nom           text NOT NULL,
  taille_octets bigint NOT NULL CHECK (taille_octets <= 26214400), -- 25 Mo
  mime_type     text,
  auteur_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_immobilier_attachments_card ON public.immobilier_attachments(card_id);

-- ---------- Table immobilier_card_reads -----------------------
-- Memorise la derniere lecture d'une carte par un user
-- (compteur numerique non-lu sur la tile de carte).
CREATE TABLE public.immobilier_card_reads (
  card_id      uuid NOT NULL REFERENCES public.immobilier_cards(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, user_id)
);

CREATE INDEX idx_immobilier_card_reads_user ON public.immobilier_card_reads(user_id);

-- =============================================================
-- Fin 10A-1
-- =============================================================
