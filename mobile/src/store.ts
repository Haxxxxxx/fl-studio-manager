// App state: the pairing (secure store), the cached library + queued edits
// (AsyncStorage), and the sync status. A tiny external store, read with
// useSyncExternalStore.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getRandomBytes } from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { createClient, SyncError, type SyncErrorCode } from "./lib/client";
import type { Pairing } from "./lib/pairing";
import { dismissConflict, editNote, emptyState, forgetGone, runSync, type Kind, type SyncState } from "./lib/sync";

const PAIRING_KEY = "hivo.pairing.v1";
const CACHE_KEY = "hivo.sync.v1";

export type AppState = {
  loaded: boolean;
  pairing: Pairing | null;
  sync: SyncState;
  syncing: boolean;
  error: SyncErrorCode | null;
  errorDetail: string | null;
};

let state: AppState = { loaded: false, pairing: null, sync: emptyState(), syncing: false, error: null, errorDetail: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const getState = (): AppState => state;

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

// Persistence of the cache, debounced (the note editor writes on every keystroke).
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flush(), 300);
}

export async function flush(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (!state.pairing) return;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(state.sync));
  } catch (e) {
    console.warn("Hivo: could not save the local cache", e);
  }
}

function setSync(sync: SyncState): void {
  setState({ sync });
  persistSoon();
}

function isPairing(v: unknown): v is Pairing {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.deviceId === "string" && typeof p.key === "string" && Array.isArray(p.hosts) && typeof p.port === "number" && typeof p.desktopName === "string";
}

function isSyncState(v: unknown): v is SyncState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.items) && !!s.pending && typeof s.pending === "object" && !!s.conflicts && typeof s.conflicts === "object";
}

export async function load(): Promise<void> {
  let pairing: Pairing | null = null;
  let sync = emptyState();
  try {
    const raw = await SecureStore.getItemAsync(PAIRING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    pairing = isPairing(parsed) ? parsed : null;
    if (pairing) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      const c: unknown = cached ? JSON.parse(cached) : null;
      if (isSyncState(c)) sync = { ...emptyState(), ...c };
    }
  } catch (e) {
    console.warn("Hivo: could not read saved data", e);
  }
  setState({ loaded: true, pairing, sync });
}

export async function pair(p: Pairing): Promise<void> {
  await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(p));
  await AsyncStorage.removeItem(CACHE_KEY);
  setState({ pairing: p, sync: emptyState(), error: null, errorDetail: null });
  await flush();
}

export async function unpair(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  await SecureStore.deleteItemAsync(PAIRING_KEY);
  await AsyncStorage.removeItem(CACHE_KEY);
  setState({ pairing: null, sync: emptyState(), error: null, errorDetail: null, syncing: false });
}

export function setNote(kind: Kind, id: string, text: string): void {
  setSync(editNote(state.sync, kind, id, text, Date.now()));
}

export function removeGone(kind: Kind, id: string): void {
  setSync(forgetGone(state.sync, kind, id));
}

export function clearConflict(kind: Kind, id: string): void {
  setSync(dismissConflict(state.sync, kind, id));
}

export function phoneName(): string {
  return (Device.modelName ?? "Phone").slice(0, 60);
}

export function appVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** Push queued notes, then pull the snapshot. Never throws: errors land in state. */
export async function sync(): Promise<boolean> {
  const pairing = state.pairing;
  if (!pairing || state.syncing) return false;
  setState({ syncing: true, error: null, errorDetail: null });
  try {
    const call = createClient({ pairing, transport: (url, init) => fetch(url, init), random: getRandomBytes, now: Date.now });
    const res = await runSync(call, () => state.sync, setSync, { phoneName: phoneName(), appVersion: appVersion() }, Date.now);
    if (res.desktopName && state.pairing && res.desktopName !== state.pairing.desktopName) {
      const updated = { ...state.pairing, desktopName: res.desktopName };
      setState({ pairing: updated });
      await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(updated));
    }
    // The client tries the host that answered first for the rest of this
    // sync; the saved order stays the desktop's (its best address first).
    await flush();
    setState({ syncing: false });
    return true;
  } catch (e) {
    const code: SyncErrorCode = e instanceof SyncError ? e.code : "server";
    setState({ syncing: false, error: code, errorDetail: e instanceof Error ? e.message : String(e) });
    await flush();
    return false;
  }
}
