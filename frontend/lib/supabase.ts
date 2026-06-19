import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Browser client with cookie-based sessions, so the server can read the auth
// state and render the right view (no logged-in flash). Null when env isn't
// configured, in which case auth is a no-op and the app runs standalone.
export const supabase = url && key ? createBrowserClient(url, key) : null;

export const supabaseEnabled = !!supabase;
