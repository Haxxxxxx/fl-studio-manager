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

/** Postgres/PostgREST errors in words the crew can act on. */
export function crewErrorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string; status?: number } | null;
  const msg = err?.message ?? String(e);
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return "That code is wrong or expired. Ask for a new one.";
  if (/wait 10 minutes/i.test(msg)) return "Too many wrong invite codes. Wait 10 minutes and try again.";
  if (/share limit|release limit|too many open invites/i.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return "Your sign-in expired. Sign in again.";
  if (/signups? not allowed|user not found|otp_disabled/i.test(msg))
    return "This email isn't on your crew's list yet. Ask whoever runs Hivo for your crew to add it, then try again.";
  if (/own 3 crews/i.test(msg)) return "You already own 3 crews. Hand one over or delete one first.";
  if (/already in 10 crews/i.test(msg)) return "You're already in 10 crews. Leave one first.";
  if (/failed to fetch|network/i.test(msg)) return "Can't reach the crew server. Are you online?";
  return msg;
}
