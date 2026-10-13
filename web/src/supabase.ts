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
  if (/wait 10 minutes/i.test(msg)) return "Too many wrong invite codes. Wait 10 minutes and try again.";
  if (/share limit|release limit|too many open invites/i.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return "Your sign-in expired. Sign in again.";
  if (/already in 10 crews/i.test(msg)) return "You're already in 10 crews. Leave one first.";
  if (/failed to fetch|network/i.test(msg)) return "Can't reach the crew server. Are you online?";
  return msg;
}
