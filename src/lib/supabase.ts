import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url!, key!) : null;
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "連線失敗，請稍後重試");
  return result as T;
}
export function command(action: string, p: Record<string, unknown>) {
  return api<Record<string, unknown>>("command", { action, p });
}
