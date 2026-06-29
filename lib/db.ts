import { supabaseAdmin as supabase } from "./supabase-admin";

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SavedAnalysis = {
  id: string;
  user_id: string;
  tool_id: string;
  title: string;
  data: unknown;
  created_at?: string;
  updated_at?: string;
};

type ProfileInput = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function upsertProfile(
  user: ProfileInput
): Promise<UserProfile | null> {
  if (!supabase) return null;
  if (!user?.id) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          name: user.name ?? null,
          image: user.image ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select()
      .single();
    if (error) return null;
    return data as UserProfile;
  } catch {
    return null;
  }
}

export async function saveAnalysis(
  userId: string,
  toolId: string,
  title: string,
  data: unknown
): Promise<SavedAnalysis | null> {
  if (!supabase) return null;
  if (!userId) return null;
  try {
    const { data: row, error } = await supabase
      .from("saved_analyses")
      .insert({
        user_id: userId,
        tool_id: toolId,
        title,
        data,
      })
      .select()
      .single();
    if (error) return null;
    return row as SavedAnalysis;
  } catch {
    return null;
  }
}

export async function listAnalyses(
  userId: string
): Promise<SavedAnalysis[] | null> {
  if (!supabase) return null;
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("saved_analyses")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) return null;
    return (data ?? []) as SavedAnalysis[];
  } catch {
    return null;
  }
}

export async function loadAnalysis(
  id: string,
  userId?: string
): Promise<SavedAnalysis | null> {
  if (!supabase) return null;
  if (!id) return null;
  try {
    let query = supabase.from("saved_analyses").select("*").eq("id", id);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.single();
    if (error) return null;
    return data as SavedAnalysis;
  } catch {
    return null;
  }
}

export async function deleteAnalysis(
  id: string,
  userId?: string
): Promise<boolean | null> {
  if (!supabase) return null;
  if (!id) return null;
  try {
    let query = supabase.from("saved_analyses").delete().eq("id", id);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { error } = await query;
    if (error) return null;
    return true;
  } catch {
    return null;
  }
}
