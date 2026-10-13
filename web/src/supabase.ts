import { createClient } from "@supabase/supabase-js";

// Browser → Supabase (EU) directly: crew data never passes through Vercel.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "flm-crew-web" } })
  : null;

export function errorMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? String(e);
  if (/invite code not found/i.test(msg)) return "That invite code doesn't exist. Check it with whoever sent it.";
  if (/invite code expired/i.test(msg)) return "That invite code has expired. Ask for a new one.";
  if (/used up/i.test(msg)) return "That invite code has been used up. Ask for a new one.";
  if (/token has expired|invalid.*otp|otp.*invalid/i.test(msg)) return "That code is wrong or expired. Ask for a new one.";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/failed to fetch|network/i.test(msg)) return "Can't reach the crew server. Are you online?";
  return msg;
}
