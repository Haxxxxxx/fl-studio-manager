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

export const crewEnabled = supabase !== null;

/** Postgres/PostgREST errors in words the crew can act on. */
export function crewErrorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string; status?: number } | null;
  const msg = err?.message ?? String(e);
  if (/invite code not found/i.test(msg)) return "That invite code doesn't exist. Check it with whoever sent it.";
  if (/invite code expired/i.test(msg)) return "That invite code has expired. Ask for a new one.";
  if (/used up/i.test(msg)) return "That invite code has been used up. Ask for a new one.";
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return "That code is wrong or expired. Ask for a new one.";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/failed to fetch|network/i.test(msg)) return "Can't reach the crew server. Are you online?";
  return msg;
}
