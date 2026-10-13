import { createClient } from "@supabase/supabase-js";

// Browser → Supabase (EU) directly: crew data never passes through Vercel.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "flm-crew-web" } })
  : null;

/** Errors in words the crew can act on, in their language (same text as the desktop app). */
export { crewErrorMessage as errorMessage } from "@shared/lib/crewMessages";
