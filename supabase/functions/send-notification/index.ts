// supabase/functions/send-notification/index.ts
//
// Edge Function : envoie une notification push FCM a une liste d'utilisateurs.
//
// Workflow :
//   1. Verifie que l'appelant est authentifie (JWT valide)
//   2. Valide les entrees (userIds, title, body, url)
//   3. Recupere les fcm_token des destinataires (via SERVICE_ROLE_KEY)
//   4. Fabrique un access_token Google a partir du compte de service (JWT signe -> OAuth2)
//   5. Envoie a chaque token un message "data-only" via FCM HTTP v1
//   6. Retourne { success, sent, failed, recipients }
//
// Securite :
//   - Authentification requise (tout utilisateur connecte peut appeler -- voir note V1)
//   - Le secret FIREBASE_SERVICE_ACCOUNT_B64 (cle privee du compte de service) reste
//     cote serveur, jamais expose au client.
//   - Messages "data-only" : la notification est construite par src/sw.js (pas de doublon).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5";

// ============================================================================
// Types
// ============================================================================

interface SendNotificationBody {
  userIds: string[];
  title?: string;
  body?: string;
  url?: string;
}

interface SuccessResponse {
  success: true;
  sent: number;
  failed: number;
  recipients: number;
}

interface ErrorResponse {
  success: false;
  error: string;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

// ============================================================================
// Constantes
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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
 * Fabrique un access_token Google a partir du compte de service.
 * Signe un JWT (RS256) avec la cle privee, puis l'echange contre un
 * access_token via le endpoint OAuth2 de Google.
 */
async function getGoogleAccessToken(
  serviceAccount: ServiceAccount,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");

  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Echec OAuth Google : " + JSON.stringify(data));
  }
  return data.access_token;
}

/**
 * Envoie un message "data-only" a un token FCM via l'API HTTP v1.
 * Retourne true si FCM a accepte le message.
 */
async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: { title: string; body: string; url: string },
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data: {
            title: payload.title,
            body: payload.body,
            url: payload.url,
          },
          webpush: { headers: { Urgency: "high" } },
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`FCM a renvoye ${res.status} :`, errBody);
  }
  return res.ok;
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

  // ---------- 1. Variables d'environnement ----------
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const FIREBASE_SERVICE_ACCOUNT_B64 = Deno.env.get(
    "FIREBASE_SERVICE_ACCOUNT_B64",
  );

  if (
    !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY ||
    !FIREBASE_SERVICE_ACCOUNT_B64
  ) {
    console.error("Variables d'environnement manquantes");
    return errorResponse("Configuration serveur invalide.", 500);
  }

  // ---------- 2. Authentification de l'appelant ----------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Authentification requise.", 401);
  }

  const supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: caller }, error: callerError } =
    await supabaseAuthClient.auth.getUser();

  if (callerError || !caller) {
    return errorResponse("Session invalide ou expiree.", 401);
  }

  // ---------- 3. Parsing et validation du body ----------
  let body: SendNotificationBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Corps de requete JSON invalide.", 400);
  }

  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const title = String(body.title ?? "Omnes Orga").slice(0, 120);
  const messageBody = String(body.body ?? "").slice(0, 240);
  const url = String(body.url ?? "/");

  if (userIds.length === 0) {
    return errorResponse("Aucun destinataire (userIds vide).", 400);
  }

  // ---------- 4. Recuperation des fcm_token (client service_role) ----------
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, fcm_token")
    .in("id", userIds)
    .not("fcm_token", "is", null);

  if (profilesError) {
    console.error("Erreur lecture profiles :", profilesError);
    return errorResponse("Lecture des destinataires impossible.", 500);
  }

  const tokens = (profiles ?? [])
    .map((p) => p.fcm_token as string)
    .filter((t) => typeof t === "string" && t.length > 0);

  if (tokens.length === 0) {
    return jsonResponse(
      { success: true, sent: 0, failed: 0, recipients: 0 },
      200,
    );
  }

  // ---------- 5. Fabrication du jeton OAuth2 ----------
  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(atob(FIREBASE_SERVICE_ACCOUNT_B64));
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT_B64 illisible (base64/JSON)");
    return errorResponse("Configuration FCM invalide.", 500);
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    console.error("Erreur OAuth Google :", err);
    return errorResponse("Authentification FCM impossible.", 502);
  }

  // ---------- 6. Envoi a chaque token ----------
  let sent = 0;
  let failed = 0;
  for (const token of tokens) {
    const ok = await sendToToken(
      accessToken,
      serviceAccount.project_id,
      token,
      { title, body: messageBody, url },
    );
    if (ok) sent++;
    else failed++;
  }

  // ---------- 7. Succes ----------
  return jsonResponse(
    { success: true, sent, failed, recipients: tokens.length },
    200,
  );
});
