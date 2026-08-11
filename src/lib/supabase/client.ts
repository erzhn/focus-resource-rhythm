import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Клиент Supabase для браузера (Client Components).
 * Использует только публичные ключи (безопасно для клиента).
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
