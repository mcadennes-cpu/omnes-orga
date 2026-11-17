// supabase/functions/signature/index.ts
//
// Edge Function du module Signatures (etape 24).
//
// UNE fonction, plusieurs actions (champ `action` du corps JSON) :
//   consentement  -> texte de consentement a afficher avant de signer
//   envoyer       -> fige le PDF (empreinte SHA-256) et previent les signataires
//   demander_code -> envoie un code a usage unique par mail (10 min, 5 essais)
//   signer        -> verifie le code et l'empreinte, enregistre la signature ;
//                    le dernier signataire declenche le scellement
//   refuser       -> refus motive (bloque la demande)
//   relancer      -> rappel aux signataires attendus (1 fois par heure max)
//   annuler       -> annulation motivee par le createur ou un super_admin
//   sceller       -> relance un scellement qui aurait echoue
//   classer       -> range le PDF scelle dans le module Contrats (SIM) ;
//                    appele aussi automatiquement apres chaque scellement
//                    (etape 25, rejouable sans doublon)
//
// PARTAGE DES ROLES
//   Cette fonction fait ce que SQL ne sait pas faire : verifier le jeton de
//   connexion, relire le PDF et calculer son empreinte, calculer le HMAC du
//   code, envoyer les mails, fabriquer le PDF scelle (pdf-lib). Chaque
//   changement d'etat est confie a une fonction SQL de 24C-1, qui ecrit
//   statut + preuve + journal dans UNE transaction, et re-verifie les droits.
//
// SECRETS (Edge Functions > Secrets)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fournis)
//   RESEND_API_KEY          envoi des mails (deja utilise par create-medecin)
//   SIGNATURE_CODE_SECRET   cle du HMAC des codes (64 caracteres aleatoires)
//   APP_URL (optionnel)     lien dans les mails, defaut https://omnes-orga.vercel.app
//
// Les reponses metier sont en HTTP 200 : { ok: true, ... } ou
// { ok: false, erreur: "message affichable" }. 401 si non connecte.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

// ============================================================================
// Constantes
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "signatures";
const EXPEDITEUR = "Omnès Médecins <noreply@app.omnesmedecins.fr>";

// Texte de consentement. Toute modification du texte => nouvelle version :
// la version est enregistree avec chaque signature, le texte complet aussi.
// A FAIRE RELIRE PAR UN JURISTE (cf. docs/cabinet-medical-app.md, module 9).
const CONSENTEMENT_VERSION = "v1-2026-11";
function texteConsentement(titre: string, empreinte: string): string {
  return (
    `J'ai pris connaissance de l'intégralité du document « ${titre} » ` +
    `(empreinte SHA-256 : ${empreinte}) et je consens à le signer électroniquement. ` +
    `Je reconnais que cette signature, rattachée à mon compte personnel et confirmée ` +
    `par un code à usage unique reçu sur mon adresse e-mail, manifeste mon ` +
    `consentement aux obligations qui découlent de ce document (articles 1366 et 1367 ` +
    `du Code civil).`
  );
}

const TYPES_LIBELLES: Record<string, string> = {
  avenant: "Avenant",
  pv: "Procès-verbal",
  feuille_presence: "Feuille de présence",
  contrat_remplacement: "Contrat de remplacement",
  autre: "Document",
};

// Messages SQL (sans accents, cf. 24C-1) -> messages affichables.
const MESSAGES: Array<[string, string]> = [
  ["Ouvrez le document avant de signer", "Ouvrez d'abord le document pour pouvoir le signer."],
  ["Ce n'est pas encore votre tour", "Ce n'est pas encore votre tour : un signataire précédent doit signer d'abord."],
  ["Ce n'est pas votre signature", "Vous ne faites pas partie des signataires attendus."],
  ["Deja traite", "Vous avez déjà répondu à cette demande."],
  ["Demande bloquee par un refus", "Un signataire a refusé : la demande est bloquée."],
  ["Demande non ouverte a la signature", "Cette demande n'est plus ouverte à la signature."],
  ["Demande deja envoyee", "Cette demande a déjà été envoyée."],
  ["Seul le createur peut envoyer", "Seul le créateur de la demande peut l'envoyer."],
  ["Envoi reserve a un super_admin actif", "L'envoi est réservé aux super administrateurs."],
  ["Aucun document depose", "Déposez d'abord le PDF à faire signer."],
  ["Aucun signataire", "Ajoutez au moins un signataire."],
  ["Un signataire n'est plus actif", "Un des signataires n'a plus de compte actif."],
  ["Un signataire n'a pas d'adresse mail", "Un des signataires n'a pas d'adresse e-mail."],
  ["Motif obligatoire", "Indiquez un motif (3 caractères au moins)."],
  ["Relance reservee", "La relance est réservée au créateur ou à un super administrateur."],
  ["Annulation reservee", "L'annulation est réservée au créateur ou à un super administrateur."],
  ["Seule une demande en cours peut etre annulee", "Seule une demande en cours peut être annulée."],
  ["Compte inactif", "Votre compte est désactivé."],
  ["Tous les signataires n'ont pas signe", "Tous les signataires n'ont pas encore signé."],
  ["Seul un document entierement signe peut etre classe", "Seul un document entièrement signé peut être rangé."],
];

function messageAffichable(brut: string): string {
  for (const [cle, texte] of MESSAGES) {
    if (brut.includes(cle)) return texte;
  }
  console.error("Erreur non traduite :", brut);
  return "L'action n'a pas pu aboutir. Réessayez ou prévenez un administrateur.";
}

// ============================================================================
// Outils
// ============================================================================

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
const echec = (erreur: string) => json({ ok: false, erreur });

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(message)));
}

// Code a 6 chiffres, tirage uniforme (rejet des valeurs qui biaiseraient le modulo).
function nouveauCode(): string {
  const limite = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const tab = new Uint32Array(1);
  do { crypto.getRandomValues(tab); } while (tab[0] >= limite);
  return String(tab[0] % 1_000_000).padStart(6, "0");
}

function ipAppelant(req: Request): string | null {
  const brut = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  // Controle grossier : Postgres refuserait une valeur mal formee (type inet).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(brut) || /^[0-9a-fA-F:]{2,39}$/.test(brut)) return brut;
  return null;
}

function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  if (!domaine) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domaine}`;
}

const FORMAT_PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
function dateParis(iso: string | null): string {
  if (!iso) return "—";
  return `${FORMAT_PARIS.format(new Date(iso))} (heure de Paris)`;
}

function echapperHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Mails (Resend) et push (send-notification)
// ============================================================================

async function envoyerMail(params: { a: string; sujet: string; titre: string; lignes: string[]; lien?: string }):
  Promise<{ ok: boolean; id?: string; erreur?: string }> {
  const cle = Deno.env.get("RESEND_API_KEY");
  if (!cle) return { ok: false, erreur: "RESEND_API_KEY manquante" };
  const lien = params.lien
    ? `<p style="margin:24px 0"><a href="${params.lien}" style="background:#1a3a52;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:600">Ouvrir dans Omnès Orga</a></p>`
    : "";
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a3a52">
      <h2 style="font-size:20px;margin:0 0 16px">${echapperHtml(params.titre)}</h2>
      ${params.lignes.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${l}</p>`).join("")}
      ${lien}
      <p style="font-size:12px;color:#6b7c8a;margin-top:24px">Message automatique du module Signatures d'Omnès Orga. Ne pas répondre.</p>
    </div>`;
  const texte = [params.titre, "", ...params.lignes.map((l) => l.replace(/<[^>]+>/g, "")),
    params.lien ? `\n${params.lien}` : ""].join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR, to: [params.a], subject: params.sujet, html, text: texte }),
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erreur: corps?.message ?? `Resend ${r.status}` };
    return { ok: true, id: corps?.id };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}

// Push via la fonction existante, avec le jeton de l'appelant (elle exige un
// utilisateur connecte). Echec silencieux : une notif ratee ne casse rien.
async function pousser(authHeader: string, userIds: string[], title: string, body: string, url: string) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userIds: ids, title, body, url }),
    });
  } catch (e) {
    console.error("Push non envoye :", e);
  }
}

// ============================================================================
// Lecture des donnees (service role)
// ============================================================================

interface Demande {
  id: string; type: string; titre: string; statut: string; ordre_impose: boolean;
  source_chemin: string | null; source_nom: string | null; source_empreinte: string | null;
  createur_id: string; envoyee_at: string | null; created_at: string;
  final_chemin: string | null; sim_dossier_id: string | null;
}
interface Signataire {
  id: string; profil_id: string; ordre: number; qualite: string | null; statut: string;
  nom_fige: string | null; email_fige: string | null; signe_at: string | null; ip: string | null;
  user_agent: string | null; consentement_version: string | null; empreinte_validee: string | null;
  code_id: string | null; consulte_at: string | null;
}

async function lireDemande(admin: SupabaseClient, id: string): Promise<Demande | null> {
  const { data } = await admin.from("signature_demandes").select("*").eq("id", id).maybeSingle();
  return data as Demande | null;
}

async function lireSignataires(admin: SupabaseClient, demandeId: string): Promise<Signataire[]> {
  const { data } = await admin.from("signature_signataires").select("*")
    .eq("demande_id", demandeId).order("ordre");
  return (data ?? []) as Signataire[];
}

async function telechargerSource(admin: SupabaseClient, d: Demande): Promise<Uint8Array | null> {
  if (!d.source_chemin) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(d.source_chemin);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// Signataires dont c'est le tour (tous si l'ordre n'est pas impose).
function signatairesAttendus(d: Demande, sigs: Signataire[]): Signataire[] {
  const attente = sigs.filter((s) => s.statut === "en_attente");
  if (!d.ordre_impose) return attente;
  if (sigs.some((s) => s.statut === "refuse")) return [];
  const premier = attente.sort((a, b) => a.ordre - b.ordre)[0];
  return premier ? [premier] : [];
}

async function prevenirSignataires(params: {
  authHeader: string; d: Demande; cibles: Signataire[]; motif: "envoi" | "relance" | "tour";
}) {
  const { authHeader, d, cibles, motif } = params;
  const appUrl = Deno.env.get("APP_URL") ?? "https://omnes-orga.vercel.app";
  const libelle = TYPES_LIBELLES[d.type] ?? "Document";
  const titre = motif === "relance" ? "Rappel : document à signer" : "Document à signer";
  for (const s of cibles) {
    if (!s.email_fige) continue;
    await envoyerMail({
      a: s.email_fige,
      sujet: `${motif === "relance" ? "Rappel — " : ""}${libelle} à signer : ${d.titre}`,
      titre,
      lignes: [
        `Bonjour ${echapperHtml(s.nom_fige ?? "")},`,
        `Le document <strong>« ${echapperHtml(d.titre)} »</strong> attend votre signature dans le module Contrats d'Omnès Orga.`,
        "Ouvrez-le dans l'application, lisez-le, puis signez avec le code que vous recevrez par e-mail.",
      ],
      lien: `${appUrl}/sim/signatures/${d.id}`,
    });
  }
  await pousser(authHeader, cibles.map((s) => s.profil_id),
    motif === "relance" ? "Rappel · Signature" : "Signature",
    `Document à signer : ${d.titre}`.slice(0, 140), `/sim/signatures/${d.id}`);
}

// ============================================================================
// Scellement (24E) : mention en pied de page + page(s) de preuve
// ============================================================================

// Helvetica (police standard du PDF) ne connait que le jeu Latin-1 etendu :
// tout caractere hors de ce jeu est remplace, plutot que de faire echouer.
function texteSur(police: PDFFont, s: string): string {
  let sortie = "";
  for (const c of s.normalize("NFC")) {
    try { police.encodeText(c); sortie += c; } catch { sortie += "?"; }
  }
  return sortie;
}

function decouper(police: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split("\n")) {
    let ligne = "";
    for (const mot of paragraphe.split(/\s+/)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (police.widthOfTextAtSize(essai, taille) > largeur && ligne) {
        lignes.push(ligne);
        ligne = mot;
      } else {
        ligne = essai;
      }
    }
    lignes.push(ligne);
  }
  return lignes;
}

async function sceller(admin: SupabaseClient, demandeId: string): Promise<{ ok: boolean; erreur?: string }> {
  const d = await lireDemande(admin, demandeId);
  if (!d || d.statut !== "en_cours") return { ok: false, erreur: "Demande non scellable." };
  const sigs = await lireSignataires(admin, demandeId);
  if (sigs.length === 0 || sigs.some((s) => s.statut !== "signe")) {
    return { ok: false, erreur: "Tous les signataires n'ont pas encore signé." };
  }
  const source = await telechargerSource(admin, d);
  if (!source) return { ok: false, erreur: "Document source introuvable." };
  if ((await sha256(source)) !== d.source_empreinte) {
    console.error("Scellement : empreinte du source differente de celle figee", demandeId);
    return { ok: false, erreur: "Le document stocké ne correspond plus à celui envoyé : scellement refusé." };
  }

  const { data: journal } = await admin.from("signature_journal")
    .select("id, evenement, acteur_id, signataire_id, created_at, details, empreinte")
    .eq("demande_id", demandeId).order("id");
  const evenements = journal ?? [];
  const maillon = evenements.length ? evenements[evenements.length - 1].empreinte : "";

  const { data: createur } = await admin.from("profiles").select("prenom, nom").eq("id", d.createur_id).maybeSingle();
  const nomCreateur = `${createur?.prenom ?? ""} ${createur?.nom ?? ""}`.trim();
  const noms = new Map<string, string>(sigs.map((s) => [s.profil_id, s.nom_fige ?? ""]));
  noms.set(d.createur_id, nomCreateur);

  const pdf = await PDFDocument.load(source);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const encre = rgb(0.10, 0.23, 0.32);
  const gris = rgb(0.42, 0.49, 0.54);

  // 1. Mention en pied de chaque page du document d'origine.
  const signatairesTexte = sigs.map((s) => s.nom_fige).join(", ");
  const pages = pdf.getPages();
  const totalOrigine = pages.length;
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const mention = texteSur(normal,
      `Signé électroniquement par ${signatairesTexte} — réf. ${d.id.slice(0, 8)} — ` +
      `voir certificat en fin de document — page ${i + 1}/${totalOrigine}`);
    const taille = 6.5;
    const lignes = decouper(normal, mention, taille, width - 40);
    lignes.forEach((l, k) => page.drawText(l, { x: 20, y: 8 + (lignes.length - 1 - k) * 8, size: taille, font: normal, color: gris }));
  });

  // 2. Certificat (une ou plusieurs pages A4).
  const L = 595.28, H = 841.89, MARGE = 50, LARG = L - 2 * MARGE;
  let page: PDFPage = pdf.addPage([L, H]);
  let y = H - MARGE;
  const nouvellePageSiBesoin = (hauteur: number) => {
    if (y - hauteur < MARGE) { page = pdf.addPage([L, H]); y = H - MARGE; }
  };
  const ecrire = (texte: string, opts: { taille?: number; police?: PDFFont; couleur?: ReturnType<typeof rgb>; retrait?: number; apres?: number } = {}) => {
    const taille = opts.taille ?? 10, police = opts.police ?? normal, retrait = opts.retrait ?? 0;
    for (const l of decouper(police, texteSur(police, texte), taille, LARG - retrait)) {
      nouvellePageSiBesoin(taille + 4);
      page.drawText(l, { x: MARGE + retrait, y: y - taille, size: taille, font: police, color: opts.couleur ?? encre });
      y -= taille + 4;
    }
    y -= opts.apres ?? 0;
  };

  ecrire("Certificat de signature électronique", { taille: 18, police: gras, apres: 4 });
  ecrire("Signature électronique simple — Omnès Orga, module Signatures", { taille: 10, couleur: gris, apres: 14 });

  ecrire("Document", { taille: 12, police: gras, apres: 2 });
  ecrire(`Titre : ${d.titre}`);
  ecrire(`Nature : ${TYPES_LIBELLES[d.type] ?? d.type}`);
  ecrire(`Fichier d'origine : ${d.source_nom ?? ""} (${totalOrigine} page${totalOrigine > 1 ? "s" : ""})`);
  ecrire(`Référence de la demande : ${d.id}`);
  ecrire(`Préparée par : ${nomCreateur} — envoyée le ${dateParis(d.envoyee_at)}`);
  ecrire("Empreinte SHA-256 du document d'origine (avant ajout de ce certificat) :", { apres: 0 });
  ecrire(d.source_empreinte ?? "", { police: mono, taille: 8.5, apres: 12 });

  ecrire("Signataires", { taille: 12, police: gras, apres: 2 });
  for (const s of sigs) {
    nouvellePageSiBesoin(80);
    ecrire(`${s.ordre}. ${s.nom_fige}${s.qualite ? ` — ${s.qualite}` : ""}`, { police: gras });
    ecrire(`Adresse e-mail vérifiée par code à usage unique : ${s.email_fige}`, { retrait: 12 });
    ecrire(`Signé le ${dateParis(s.signe_at)} — UTC ${s.signe_at ?? ""}`, { retrait: 12 });
    ecrire(`Adresse IP : ${s.ip ?? "non transmise"} — consentement ${s.consentement_version}`, { retrait: 12 });
    ecrire(`Appareil : ${(s.user_agent ?? "").slice(0, 160)}`, { retrait: 12, taille: 8.5, couleur: gris });
    ecrire(`Empreinte validée : ${s.empreinte_validee}`, { retrait: 12, taille: 8.5, police: mono, apres: 6 });
  }
  ecrire("Texte de consentement accepté par chaque signataire :", { police: gras, apres: 0 });
  ecrire(texteConsentement(d.titre, d.source_empreinte ?? ""), { taille: 9, couleur: gris, apres: 12 });

  ecrire("Journal des événements", { taille: 12, police: gras, apres: 2 });
  const libelles: Record<string, string> = {
    envoi: "Envoi en signature", consultation: "Ouverture du document", code_envoye: "Code envoyé par e-mail",
    code_faux: "Code erroné", code_bloque: "Code bloqué (5 essais)", signature: "Signature",
    refus: "Refus", relance: "Relance", annulation: "Annulation", scellement: "Scellement",
  };
  for (const e of evenements) {
    const qui = e.acteur_id ? noms.get(e.acteur_id) ?? "" : "";
    ecrire(`${dateParis(e.created_at)} — ${libelles[e.evenement] ?? e.evenement}${qui ? ` — ${qui}` : ""}`, { taille: 9 });
  }
  y -= 8;
  ecrire("Empreinte du dernier événement du journal (chaînage SHA-256) :", { taille: 9, apres: 0 });
  ecrire(maillon, { police: mono, taille: 8.5, apres: 12 });

  ecrire("Valeur de ce certificat", { taille: 12, police: gras, apres: 2 });
  ecrire(
    "Ce document a été signé par voie électronique au moyen d'une signature électronique simple au sens " +
    "de l'article 1367 du Code civil et du règlement (UE) n° 910/2014 (eIDAS). Chaque signataire s'est " +
    "connecté à son compte personnel, a ouvert le document, puis a confirmé sa signature par un code à " +
    "usage unique reçu sur son adresse e-mail. L'horodatage est celui du serveur. L'empreinte SHA-256 " +
    "ci-dessus permet de vérifier que le document signé est identique au document d'origine. Le journal " +
    "des événements est conservé en ajout seul et chaîné ; il fait foi en cas de contestation.",
    { taille: 9, couleur: gris });

  pdf.setTitle(d.titre);
  pdf.setProducer("Omnès Orga — module Signatures");
  pdf.setModificationDate(new Date());
  // Sans flux d'objets compresses : lisible par les lecteurs PDF anciens.
  const final = await pdf.save({ useObjectStreams: false });
  const empreinteFinale = await sha256(final);

  const { error: errUpload } = await admin.storage.from(BUCKET).upload(
    `${d.id}/final.pdf`, new Blob([final], { type: "application/pdf" }),
    { upsert: true, contentType: "application/pdf" });
  if (errUpload) {
    console.error("Depot du PDF scelle impossible :", errUpload);
    return { ok: false, erreur: "Dépôt du document scellé impossible." };
  }

  const { error } = await admin.rpc("signature_sceller", {
    p_demande_id: d.id, p_final_empreinte: empreinteFinale, p_journal_empreinte: maillon,
  });
  if (error) {
    console.error("signature_sceller :", error.message);
    return { ok: false, erreur: messageAffichable(error.message) };
  }
  return { ok: true };
}

// ============================================================================
// Classement dans le module Contrats (etape 25)
// ============================================================================
// Copie le PDF scelle dans le bucket `sim` (nom = id de la demande), puis
// `signature_classer_sim` cree la ligne sim_fichiers et les personnes
// concernees en une transaction. Rejouable : le blob est ecrase a
// l'identique, et la fonction SQL renvoie le fichier deja classe.
// On COPIE plutot que de pointer vers le bucket `signatures` : le PDF classe
// suit les droits du SIM, et l'original scelle reste intact comme preuve.
const BUCKET_SIM = "sim";

async function classer(admin: SupabaseClient, demandeId: string): Promise<{ ok: boolean; erreur?: string }> {
  const d = await lireDemande(admin, demandeId);
  if (!d || d.statut !== "terminee" || !d.final_chemin) {
    return { ok: false, erreur: "Seul un document entièrement signé peut être rangé." };
  }
  const { data: deja } = await admin.from("sim_fichiers").select("id")
    .eq("signature_demande_id", d.id).maybeSingle();
  if (deja) return { ok: true };

  const { data: fichier, error: errDl } = await admin.storage.from(BUCKET).download(d.final_chemin);
  if (errDl || !fichier) {
    console.error("Classement : PDF scelle introuvable", d.id, errDl);
    return { ok: false, erreur: "Document signé introuvable." };
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const { error: errUp } = await admin.storage.from(BUCKET_SIM).upload(
    d.id, new Blob([octets], { type: "application/pdf" }),
    { upsert: true, contentType: "application/pdf" });
  if (errUp) {
    console.error("Classement : depot dans le SIM impossible", d.id, errUp);
    return { ok: false, erreur: "Rangement dans Contrats impossible." };
  }
  const base = (d.source_nom || d.titre || "document").replace(/\.pdf$/i, "");
  const { error } = await admin.rpc("signature_classer_sim", {
    p_demande_id: d.id, p_nom: `${base} - signé.pdf`, p_taille: octets.byteLength,
  });
  if (error) {
    console.error("signature_classer_sim :", error.message);
    return { ok: false, erreur: messageAffichable(error.message) };
  }
  return { ok: true };
}

// Scelle puis range ; un rangement manque n'empeche jamais de prevenir.
async function scellerEtClasser(admin: SupabaseClient, demandeId: string): Promise<{ ok: boolean; erreur?: string }> {
  const res = await sceller(admin, demandeId);
  if (!res.ok) return res;
  const rang = await classer(admin, demandeId);
  if (!rang.ok) console.error("Classement differe :", rang.erreur);
  return res;
}

async function prevenirFin(authHeader: string, admin: SupabaseClient, demandeId: string) {
  const d = await lireDemande(admin, demandeId);
  if (!d) return;
  const sigs = await lireSignataires(admin, demandeId);
  const appUrl = Deno.env.get("APP_URL") ?? "https://omnes-orga.vercel.app";
  const { data: createur } = await admin.from("profiles").select("email, prenom").eq("id", d.createur_id).maybeSingle();
  const destinataires = new Map<string, { email: string; nom: string }>();
  for (const s of sigs) if (s.email_fige) destinataires.set(s.profil_id, { email: s.email_fige, nom: s.nom_fige ?? "" });
  if (createur?.email) destinataires.set(d.createur_id, { email: createur.email, nom: createur.prenom ?? "" });
  for (const { email, nom } of destinataires.values()) {
    await envoyerMail({
      a: email,
      sujet: `Document signé : ${d.titre}`,
      titre: "Document signé par tous",
      lignes: [
        `Bonjour ${echapperHtml(nom)},`,
        `Tous les signataires ont signé <strong>« ${echapperHtml(d.titre)} »</strong>. Le document scellé, avec son certificat de signature, est rangé dans le module Contrats d'Omnès Orga.`,
      ],
      lien: `${appUrl}/sim/signatures/${d.id}`,
    });
  }
  await pousser(authHeader, [...destinataires.keys()], "Signature",
    `Document signé par tous : ${d.titre}`.slice(0, 140), `/sim/signatures/${d.id}`);
}

// ============================================================================
// Handler
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, erreur: "Méthode non autorisée." }, 405);

  const URL_SB = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!URL_SB || !ANON || !SERVICE) return json({ ok: false, erreur: "Configuration serveur invalide." }, 500);

  // 1. Qui appelle ? (le jeton est verifie par Supabase Auth)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, erreur: "Authentification requise." }, 401);
  const client = createClient(URL_SB, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: errUser } = await client.auth.getUser();
  if (errUser || !user) return json({ ok: false, erreur: "Session invalide ou expirée." }, 401);

  const admin = createClient(URL_SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: moi } = await admin.from("profiles").select("id, role, actif").eq("id", user.id).maybeSingle();
  if (!moi || !moi.actif || !["super_admin", "associe_gerant", "associe", "remplacant"].includes(moi.role)) {
    return json({ ok: false, erreur: "Accès refusé." }, 403);
  }

  let corps: Record<string, unknown>;
  try { corps = await req.json(); } catch { return echec("Requête invalide."); }
  const action = String(corps.action ?? "");
  const demandeId = String(corps.demandeId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(demandeId)) return echec("Demande invalide.");

  const ip = ipAppelant(req);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;

  const d = await lireDemande(admin, demandeId);
  if (!d) return echec("Demande introuvable.");
  const sigs = await lireSignataires(admin, demandeId);
  const monSig = sigs.find((s) => s.profil_id === user.id) ?? null;

  try {
    switch (action) {
      // ---------------------------------------------------------------
      case "consentement": {
        if (!monSig || !d.source_empreinte) return echec("Vous ne faites pas partie des signataires attendus.");
        return json({ ok: true, version: CONSENTEMENT_VERSION, texte: texteConsentement(d.titre, d.source_empreinte) });
      }

      // ---------------------------------------------------------------
      case "envoyer": {
        if (d.createur_id !== user.id || d.statut !== "brouillon") {
          return echec("Seul le créateur peut envoyer un brouillon.");
        }
        if (!d.sim_dossier_id) return echec("Choisissez le dossier où ranger le document signé.");
        const source = await telechargerSource(admin, d);
        if (!source) return echec("Déposez d'abord le PDF à faire signer.");
        if (new TextDecoder().decode(source.slice(0, 5)) !== "%PDF-") return echec("Le fichier déposé n'est pas un PDF.");
        try {
          await PDFDocument.load(source); // refuse les PDF chiffres : on ne pourrait pas les sceller
        } catch {
          return echec("Ce PDF est protégé ou illisible : il ne pourra pas être scellé. Exportez-le à nouveau sans mot de passe.");
        }
        const empreinte = await sha256(source);
        const { error } = await admin.rpc("signature_envoyer", {
          p_demande_id: d.id, p_acteur_id: user.id, p_empreinte: empreinte,
          p_taille: source.byteLength, p_ip: ip, p_user_agent: ua,
        });
        if (error) return echec(messageAffichable(error.message));
        const apres = await lireDemande(admin, d.id);
        const apresSigs = await lireSignataires(admin, d.id);
        if (apres) await prevenirSignataires({ authHeader, d: apres, cibles: signatairesAttendus(apres, apresSigs), motif: "envoi" });
        return json({ ok: true, empreinte });
      }

      // ---------------------------------------------------------------
      case "demander_code": {
        if (!monSig) return echec("Vous ne faites pas partie des signataires attendus.");
        const secret = Deno.env.get("SIGNATURE_CODE_SECRET");
        if (!secret || secret.length < 32) return json({ ok: false, erreur: "Configuration serveur invalide." }, 500);
        const code = nouveauCode();
        const { data, error } = await admin.rpc("signature_preparer_code", {
          p_signataire_id: monSig.id, p_acteur_id: user.id, p_code_hmac: await hmac(secret, `${monSig.id}:${code}`),
        });
        if (error) return echec(messageAffichable(error.message));
        if (data?.resultat === "trop_de_codes") {
          return echec("Trop de codes demandés : réessayez dans une heure.");
        }
        const mail = await envoyerMail({
          a: data.email,
          sujet: `Votre code de signature : ${code.slice(0, 3)} ${code.slice(3)}`,
          titre: "Code de signature",
          lignes: [
            `Votre code pour signer <strong>« ${echapperHtml(d.titre)} »</strong> :`,
            `<span style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,monospace">${code}</span>`,
            "Il est valable 10 minutes et ne peut servir qu'une fois.",
            "Si vous n'êtes pas à l'origine de cette demande, ne communiquez ce code à personne et prévenez un administrateur.",
          ],
        });
        const { error: errConf } = await admin.rpc("signature_confirmer_code", {
          p_code_id: data.code_id, p_envoye: mail.ok, p_message_id: mail.id ?? null, p_ip: ip, p_user_agent: ua,
        });
        if (errConf) console.error("signature_confirmer_code :", errConf.message);
        if (!mail.ok) {
          console.error("Mail du code non envoye :", mail.erreur);
          return echec("Le code n'a pas pu être envoyé par e-mail. Réessayez dans un instant.");
        }
        return json({ ok: true, email: masquerEmail(data.email), validiteMinutes: 10 });
      }

      // ---------------------------------------------------------------
      case "signer": {
        if (!monSig) return echec("Vous ne faites pas partie des signataires attendus.");
        const code = String(corps.code ?? "").replace(/\D/g, "");
        if (code.length !== 6) return echec("Le code comporte 6 chiffres.");
        if (corps.consentementVersion !== CONSENTEMENT_VERSION) {
          return echec("Le texte de consentement a changé : rechargez la page.");
        }
        if (corps.consentement !== true) return echec("Cochez la case de consentement.");
        const secret = Deno.env.get("SIGNATURE_CODE_SECRET");
        if (!secret || secret.length < 32) return json({ ok: false, erreur: "Configuration serveur invalide." }, 500);

        // Le serveur relit le PDF stocke et recalcule son empreinte.
        const source = await telechargerSource(admin, d);
        if (!source) return echec("Document introuvable.");
        const empreinte = await sha256(source);

        const { data, error } = await admin.rpc("signature_signer", {
          p_signataire_id: monSig.id, p_acteur_id: user.id,
          p_code_hmac: await hmac(secret, `${monSig.id}:${code}`),
          p_empreinte: empreinte,
          p_consentement_texte: texteConsentement(d.titre, d.source_empreinte ?? ""),
          p_consentement_version: CONSENTEMENT_VERSION,
          p_ip: ip, p_user_agent: ua,
        });
        if (error) return echec(messageAffichable(error.message));

        switch (data?.resultat) {
          case "code_faux":
            return echec(`Code incorrect. Il vous reste ${data.essais_restants} essai${data.essais_restants > 1 ? "s" : ""}.`);
          case "bloque":
            return echec("Code bloqué après 5 erreurs. Demandez un nouveau code.");
          case "expire":
            return echec("Ce code a expiré. Demandez un nouveau code.");
          case "aucun_code":
            return echec("Aucun code en cours. Demandez un code.");
          case "document_altere":
            console.error("ALERTE : empreinte du document modifiee", d.id);
            return echec("Le document stocké ne correspond plus à celui envoyé. Signature refusée ; prévenez le créateur.");
          case "signe":
            break;
          default:
            return echec("Réponse inattendue du serveur.");
        }

        if (data.derniere) {
          const res = await scellerEtClasser(admin, d.id);
          if (res.ok) await prevenirFin(authHeader, admin, d.id);
          else console.error("Scellement differe :", res.erreur);
          return json({ ok: true, signe: true, termine: res.ok, scellementEnAttente: !res.ok });
        }
        if (d.ordre_impose) {
          const apresSigs = await lireSignataires(admin, d.id);
          await prevenirSignataires({ authHeader, d, cibles: signatairesAttendus(d, apresSigs), motif: "tour" });
        }
        return json({ ok: true, signe: true, termine: false });
      }

      // ---------------------------------------------------------------
      case "refuser": {
        if (!monSig) return echec("Vous ne faites pas partie des signataires attendus.");
        const motif = String(corps.motif ?? "").trim().slice(0, 1000);
        const { error } = await admin.rpc("signature_refuser", {
          p_signataire_id: monSig.id, p_acteur_id: user.id, p_motif: motif, p_ip: ip, p_user_agent: ua,
        });
        if (error) return echec(messageAffichable(error.message));
        const { data: createur } = await admin.from("profiles").select("email, prenom").eq("id", d.createur_id).maybeSingle();
        const appUrl = Deno.env.get("APP_URL") ?? "https://omnes-orga.vercel.app";
        if (createur?.email) {
          await envoyerMail({
            a: createur.email,
            sujet: `Signature refusée : ${d.titre}`,
            titre: "Un signataire a refusé de signer",
            lignes: [
              `${echapperHtml(monSig.nom_fige ?? "")} a refusé de signer <strong>« ${echapperHtml(d.titre)} »</strong>.`,
              `Motif : ${echapperHtml(motif)}`,
              "La demande est bloquée : annulez-la puis préparez une nouvelle version si besoin.",
            ],
            lien: `${appUrl}/sim/signatures/${d.id}`,
          });
        }
        await pousser(authHeader, [d.createur_id], "Signature refusée",
          `${monSig.nom_fige} : ${motif}`.slice(0, 140), `/sim/signatures/${d.id}`);
        return json({ ok: true });
      }

      // ---------------------------------------------------------------
      case "relancer": {
        const { data, error } = await admin.rpc("signature_relancer", {
          p_demande_id: d.id, p_acteur_id: user.id, p_ip: ip, p_user_agent: ua,
        });
        if (error) return echec(messageAffichable(error.message));
        const ids: string[] = data?.profils ?? [];
        if (ids.length === 0) {
          return echec("Personne à relancer pour l'instant (une relance par heure et par signataire au plus).");
        }
        await prevenirSignataires({ authHeader, d, cibles: sigs.filter((s) => ids.includes(s.profil_id)), motif: "relance" });
        return json({ ok: true, relances: ids.length });
      }

      // ---------------------------------------------------------------
      case "annuler": {
        const motif = String(corps.motif ?? "").trim().slice(0, 1000);
        const { error } = await admin.rpc("signature_annuler", {
          p_demande_id: d.id, p_acteur_id: user.id, p_motif: motif, p_ip: ip, p_user_agent: ua,
        });
        if (error) return echec(messageAffichable(error.message));
        await pousser(authHeader, sigs.filter((s) => s.statut === "en_attente").map((s) => s.profil_id),
          "Signature annulée", `Demande annulée : ${d.titre}`.slice(0, 140), `/sim/signatures/${d.id}`);
        return json({ ok: true });
      }

      // ---------------------------------------------------------------
      case "sceller": {
        if (d.createur_id !== user.id && moi.role !== "super_admin" && !monSig) {
          return echec("Accès refusé.");
        }
        const res = await scellerEtClasser(admin, d.id);
        if (!res.ok) return echec(res.erreur ?? "Scellement impossible.");
        await prevenirFin(authHeader, admin, d.id);
        return json({ ok: true });
      }

      // ---------------------------------------------------------------
      case "classer": {
        if (d.createur_id !== user.id && moi.role !== "super_admin" && !monSig) {
          return echec("Accès refusé.");
        }
        const res = await classer(admin, d.id);
        if (!res.ok) return echec(res.erreur ?? "Rangement impossible.");
        return json({ ok: true });
      }

      default:
        return echec("Action inconnue.");
    }
  } catch (e) {
    console.error(`Action ${action} :`, e);
    return json({ ok: false, erreur: "Erreur inattendue du serveur." }, 500);
  }
});
