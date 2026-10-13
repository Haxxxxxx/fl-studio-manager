import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The crew backend (Supabase, EU region; docs/ARCHITECTURE.md). Only the
// project URL and the public anon key ship in the app: row-level security in
// the database enforces who sees what. Without them, crew features are off.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Sign-in is by 6-digit code, never by a link back into the app.
          detectSessionInUrl: false,
          storageKey: "flm-auth",
        },
      })
    : null;

/** Postgres/PostgREST errors in words the crew can act on (shared with the web dashboard). */
export { crewErrorMessage } from "./crewMessages";
