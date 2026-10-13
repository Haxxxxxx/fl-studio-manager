/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Crew backend (Supabase, EU). Optional: crew features are off without it. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's public anon key. Never the service_role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
