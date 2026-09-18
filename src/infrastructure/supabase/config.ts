export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}
