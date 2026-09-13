import type { User } from '@supabase/supabase-js';
import { supabase } from '../backend/SupabaseClient';

export async function getTerrainEditorUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signInTerrainEditor(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Supabase did not return a user.');
  return data.user;
}

export async function signUpTerrainEditor(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Supabase did not return a user.');
  return data.user;
}

export async function signOutTerrainEditor(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
