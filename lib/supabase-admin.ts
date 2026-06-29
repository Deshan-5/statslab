import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service role client — bypasses RLS. Only use in server-side code (API routes, auth callbacks).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client.
export const supabaseAdmin: SupabaseClient | null =
  url && serviceRoleKey ? createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  }) : null;
