// supabase/functions/create-medecin/index.ts
//
// Edge Function : creation d'un nouveau medecin par un super_admin.
//
// Workflow :
//   1. Verifie que l'appelant est authentifie (JWT valide)
//   2. Verifie que l'appelant a le role super_admin
//   3. Valide les entrees (email, nom, prenom, role)
//   4. Genere un mot de passe temporaire securise (12 chars, 4 classes)
//   5. Cree l'AuthUser via auth.admin.createUser (email_confirm: true)
//   6. UPDATE profiles avec le role, nom, prenom (le trigger handle_new_user
//      a deja insere une ligne avec des valeurs par defaut)
//   7. En cas d'echec apres creation de l'AuthUser : rollback (deleteUser)
//   8. Retourne { success, userId, email, tempPassword }
//
// Securite :
//   - "Require JWT" doit etre actif sur la fonction (config Supabase)
//   - Verification du role super_admin a l'interieur de la fonction (defense en profondeur)
//   - Utilise la SERVICE_ROLE_KEY pour les operations admin (jamais exposee au client)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ============================================================================
// Types
// ============================================================================

type Role = "super_admin" | "associe_gerant" | "associe" | "remplacant";

interface CreateMedecinBody {
  email: string;
  nom: string;
  prenom: string;
  role: Role;
}

interface SuccessResponse {
  success: true;
  userId: string;
  email: string;
  tempPassword: string;
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ============================================================================
// Constantes
// ============================================================================

const ALLOWED_ROLES: ReadonlyArray<Role> = [
  "super_admin",
  "associe_gerant",
  "associe",
  "remplacant",
];

// Caracteres pour la generation du mot de passe.
// On exclut les ambigus (0, O, l, 1, I) pour limiter les erreurs de transcription.
const LOWER = "abcdefghijkmnopqrstuvwxyz"; // pas de l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // pas de I, O
const DIGITS = "23456789"; // pas de 0, 1
const SYMBOLS = "!@#$%&*+=?";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(
  body: SuccessResponse | ErrorResponse,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ success: false, error: message }, status);
}

/**
 * Genere un mot de passe de 12 caracteres avec au moins :
 *   - 1 minuscule, 1 majuscule, 1 chiffre, 1 symbole
 * Le reste est tire au hasard dans l'union des 4 classes.
 * Utilise crypto.getRandomValues (cryptographically secure).
 */
function generateTempPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const length = 12;

  // 1. Garantir un caractere de chaque classe
  const chars: string[] = [
    pickRandom(LOWER),
    pickRandom(UPPER),
    pickRandom(DIGITS),
    pickRandom(SYMBOLS),
  ];

  // 2. Completer avec des caracteres aleatoires de l'union
  for (let i = chars.length; i < length; i++) {
    chars.push(pickRandom(all));
  }

  // 3. Melanger (Fisher-Yates) pour ne pas avoir le pattern "lower-upper-digit-symbol-..."
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

function pickRandom(alphabet: string): string {
  return alphabet[secureRandomInt(alphabet.length)];
}

function secureRandomInt(max: number): number {
  // Tirage uniforme dans [0, max[ via getRandomValues.
  // On ignore le biais modulo car max <<< 2^32.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function isValidEmail(email: string): boolean {
  // Regex simple, suffit pour bloquer les saisies clairement erronees.
  // Supabase fera de toute facon sa propre validation a auth.admin.createUser.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// Handler principal
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // ---------- CORS preflight ----------
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Methode non autorisee.", 405);
  }

  // ---------- 1. Recuperation des variables d'environnement ----------
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    console.error("Variables d'environnement manquantes");
    return errorResponse("Configuration serveur invalide.", 500);
  }

  // ---------- 2. Authentification de l'appelant ----------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authentification requise.", 401);
  }

  // Client "anon" pour identifier l'appelant via son JWT.
  // (On ne peut pas utiliser le client service_role pour ca : il ne respecte
  // pas le JWT du header et renvoie toujours l'utilisateur du token de service.)
  const supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: caller }, error: callerError } =
    await supabaseAuthClient.auth.getUser();

  if (callerError || !caller) {
    return errorResponse("Session invalide ou expiree.", 401);
  }

  // ---------- 3. Verification du role super_admin ----------
  // Client "service_role" pour bypass RLS et lire le role de l'appelant.
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role, actif")
    .eq("id", caller.id)
    .single();

  if (profileError || !callerProfile) {
    console.error("Profil appelant introuvable :", profileError);
    return errorResponse("Profil utilisateur introuvable.", 403);
  }

  if (callerProfile.role !== "super_admin") {
    return errorResponse(
      "Seul un super administrateur peut creer un compte.",
      403,
    );
  }

  if (!callerProfile.actif) {
    return errorResponse("Votre compte est desactive.", 403);
  }

  // ---------- 4. Parsing et validation du body ----------
  let body: CreateMedecinBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Corps de requete JSON invalide.", 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const nom = String(body.nom ?? "").trim();
  const prenom = String(body.prenom ?? "").trim();
  const role = body.role;

  if (!email || !isValidEmail(email)) {
    return errorResponse("Adresse email invalide.", 400);
  }
  if (!nom) {
    return errorResponse("Le nom est requis.", 400);
  }
  if (!prenom) {
    return errorResponse("Le prenom est requis.", 400);
  }
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return errorResponse("Role invalide.", 400);
  }

  // ---------- 5. Verification que l'email n'est pas deja utilise ----------
  // On regarde a la fois dans profiles (cas nominal) et indirectement dans
  // auth.users (via createUser qui echouera). On fait un check explicite
  // sur profiles pour pouvoir distinguer le cas "compte desactive existant"
  // (et donner un message clair).
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, actif")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const msg = existingProfile.actif
      ? "Cet email est deja associe a un compte existant."
      : "Cet email correspond a un compte desactive. Reactivez-le depuis la fiche du medecin.";
    return errorResponse(msg, 409);
  }

  // ---------- 6. Generation du mot de passe temporaire ----------
  const tempPassword = generateTempPassword();

  // ---------- 7. Creation de l'AuthUser ----------
  const { data: created, error: createError } = await supabaseAdmin.auth
    .admin
    .createUser({
      email,
      password: tempPassword,
      email_confirm: true, // on n'utilise pas la confirmation email
    });

  if (createError || !created.user) {
    // Cas le plus frequent : email deja dans auth.users mais pas dans profiles
    // (par exemple compte cree directement dans le dashboard sans trigger).
    console.error("Erreur creation AuthUser :", createError);
    const isDuplicate = createError?.message?.toLowerCase().includes("already");
    return errorResponse(
      isDuplicate
        ? "Cet email est deja associe a un compte existant."
        : "Erreur lors de la creation du compte.",
      isDuplicate ? 409 : 500,
    );
  }

  const newUserId = created.user.id;

  // ---------- 8. UPDATE profiles avec les vraies valeurs ----------
  // Le trigger handle_new_user a deja insere :
  //   { id, email, nom: '', prenom: '', role: 'remplacant', actif: true }
  // On remet a jour le role, le nom et le prenom.
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ nom, prenom, role })
    .eq("id", newUserId);

  if (updateError) {
    // Rollback : on supprime l'AuthUser pour ne pas laisser un compte
    // a moitie configure (qui pourrait se connecter mais avec un role 'remplacant'
    // et un nom vide, ce qui est confusing).
    console.error("Erreur UPDATE profiles, rollback :", updateError);
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return errorResponse(
      "Erreur lors de la configuration du profil. La creation a ete annulee.",
      500,
    );
  }

  // ---------- 9. Succes ----------
  return jsonResponse(
    {
      success: true,
      userId: newUserId,
      email,
      tempPassword,
    },
    200,
  );
});
