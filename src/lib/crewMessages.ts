// Every message on the way into a crew, on desktop and web (shared through
// @shared), in the user's language. Sign-up is closed: the admin adds the
// email first, the person signs in with an emailed code, then redeems the
// crew's invite code. Each dead end says what to do next.

export type UiLang = "fr" | "en";

/** French when the system or browser is in French, else English. */
export function uiLang(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): UiLang {
  return languages.some((l) => /^fr\b/i.test(l)) ? "fr" : "en";
}

const TEXT = {
  unknownEmail: {
    en: "This email isn't on your crew's list yet. Ask whoever runs Hivo for your crew to add it, then ask for a code again.",
    fr: "Cet email n'est pas encore sur la liste de ton crew. Demande à la personne qui gère Hivo pour ton crew de l'ajouter, puis redemande un code.",
  },
  badCode: {
    en: "That code is wrong or expired. Ask for a new one.",
    fr: "Ce code est faux ou expiré. Demande un nouveau code.",
  },
  codeTooSoon: {
    en: "A code was just sent. Wait a few seconds before asking for another one.",
    fr: "Un code vient d'être envoyé. Attends quelques secondes avant d'en redemander un.",
  },
  invalidInvite: {
    en: "That invite code didn't work: it's wrong, expired, used up or revoked (or you're already in 10 crews). Ask your crew for a new one.",
    fr: "Ce code d'invitation ne marche pas : il est faux, expiré, déjà utilisé ou révoqué (ou tu es déjà dans 10 crews). Demande un nouveau code à ton crew.",
  },
  tooManyInvites: {
    en: "Too many wrong invite codes. Wait 10 minutes and try again.",
    fr: "Trop de codes d'invitation faux. Attends 10 minutes et réessaie.",
  },
  tooManyTries: {
    en: "Too many tries. Wait a minute and try again.",
    fr: "Trop d'essais. Attends une minute et réessaie.",
  },
  expired: {
    en: "Your sign-in expired. Sign in again.",
    fr: "Ta connexion a expiré. Reconnecte-toi.",
  },
  ownThree: {
    en: "You already own 3 crews. Hand one over or delete one first.",
    fr: "Tu possèdes déjà 3 crews. Passe-en un à quelqu'un d'autre ou supprime-en un d'abord.",
  },
  inTen: {
    en: "You're already in 10 crews. Leave one first.",
    fr: "Tu es déjà dans 10 crews. Quittes-en un d'abord.",
  },
  offline: {
    en: "Can't reach the crew server. Are you online?",
    fr: "Impossible de joindre le serveur du crew. Tu es bien connecté à internet ?",
  },
  noCrew: {
    en: "You're signed in as {email}, but not in a crew yet. Enter the invite code your crew sent you (8 letters and numbers).",
    fr: "Tu es connecté en tant que {email}, mais tu n'es pas encore dans un crew. Entre le code d'invitation que ton crew t'a envoyé (8 lettres et chiffres).",
  },
  noInviteYet: {
    en: "No code yet? Ask your crew's owner to make one in Hivo (Settings → Crew → New invite code).",
    fr: "Pas encore de code ? Demande au propriétaire du crew d'en créer un dans Hivo (Settings → Crew → New invite code).",
  },
  signInHint: {
    en: "Your crew admin adds your email first. Then you get a 6-digit code here, no password.",
    fr: "L'admin de ton crew ajoute d'abord ton email. Ensuite tu reçois ici un code à 6 chiffres, sans mot de passe.",
  },
} satisfies Record<string, Record<UiLang, string>>;

export type CrewTextKey = keyof typeof TEXT;

export function crewText(key: CrewTextKey, lang: UiLang = uiLang(), vars: Record<string, string> = {}): string {
  return TEXT[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** Supabase and database errors in words the crew can act on. */
export function crewErrorMessage(e: unknown, lang: UiLang = uiLang()): string {
  const msg = (e as { message?: string } | null)?.message ?? String(e);
  const t = (k: CrewTextKey) => crewText(k, lang);
  if (/signups? not allowed|user not found|otp_disabled/i.test(msg)) return t("unknownEmail");
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return t("badCode");
  if (/only request this after|over_email_send_rate_limit|email rate limit/i.test(msg)) return t("codeTooSoon");
  if (/wait 10 minutes/i.test(msg)) return t("tooManyInvites");
  if (/share limit|release limit|too many open invites/i.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/rate limit|too many/i.test(msg)) return t("tooManyTries");
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return t("expired");
  if (/own 3 crews/i.test(msg)) return t("ownThree");
  if (/already in 10 crews/i.test(msg)) return t("inTen");
  if (/failed to fetch|network/i.test(msg)) return t("offline");
  return msg;
}
