import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabaseAgenda, Profile } from '../lib/supabase';

// Session du projet Supabase PLANNING (voir lib/supabase.ts).
//
// Tant que les données de l'agenda vivent dans l'ancien projet (étapes 3 à 6),
// ses policies RLS exigent un jeton d'auth de CE projet : la session Omnès-Orga
// ne suffit pas. Ce hook gère donc une session Planning séparée :
// - persistée dans localStorage (storageKey 'sb-agenda-auth'),
// - rafraîchie automatiquement par supabase-js,
// - établie une seule fois par navigateur via l'écran de liaison
//   (PlanningLinkPage), qui appelle signIn().
//
// À l'étape 7 (migration des données vers le projet principal), ce hook
// disparaît avec le client supabaseAgenda.
export function useAgendaSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (userId: string) => {
      const { data, error } = await supabaseAgenda
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;
      setProfile(!error && data ? data : null);
      setLoading(false);
    };

    supabaseAgenda.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabaseAgenda.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Retourne un message d'erreur affichable (null si succès).
  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabaseAgenda.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (error.message.includes('Invalid login credentials')) {
      return 'Identifiants incorrects — utilisez ceux de l’application OMNÈS PLANNING.';
    }
    return error.message;
  };

  const signOut = async () => {
    await supabaseAgenda.auth.signOut();
  };

  return { session, profile, loading, signIn, signOut };
}
