/**
 * Определение режима работы приложения.
 *
 * Если заданы переменные Supabase — приложение работает с реальной базой (RLS, PostgreSQL).
 * Если нет — включается ДЕМО-РЕЖИМ с данными в памяти. Демо-режим явно обозначается
 * в интерфейсе и предназначен только для локального просмотра без ключей.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** true, если приложение сейчас в демонстрационном режиме (без реальной БД). */
export const isDemoMode = !isSupabaseConfigured;

/**
 * AI-ассистент (Claude). Ключ только серверный — на клиент не отдаётся.
 * Клиент узнаёт о доступности через ответ API-роута, а не через эту переменную.
 */
export const isAssistantConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
export const assistantModel = process.env.ASSISTANT_MODEL || "claude-opus-5";
