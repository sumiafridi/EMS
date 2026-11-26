import { createClient } from "@supabase/supabase-js";
// Supabase URL and publishable key are public client configuration; database access is enforced by RLS and authenticated roles.
export const supabase = createClient("https://rqjaxrlmwccczcfwwvam.supabase.co", "sb_publishable_WYK2hex5BgUJQ66YdW1LCw_KB93E3Yv", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
