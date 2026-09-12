"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const credentials = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль не короче 8 символов"),
});

export interface AuthState {
  error?: string;
  /** Сообщение об успехе (например, «проверьте почту»). */
  info?: string;
}

/**
 * Лимиты входа/регистрации: защита от перебора пароля и от рассылки писем
 * на чужие адреса. Считаем и по IP, и по конкретному email.
 */
async function guard(scope: string, email: string, perIp: number, perEmail: number) {
  const ip = await clientIp();
  const byIp = await rateLimit(`${scope}-ip`, ip, perIp, 900);
  if (!byIp.allowed) return byIp;
  return rateLimit(`${scope}-email`, email, perEmail, 900);
}

const tooMany = (retryAfterSeconds: number): AuthState => ({
  error: `Слишком много попыток. Повторите через ${Math.ceil(retryAfterSeconds / 60)} мин.`,
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "Демо-режим: авторизация недоступна без ключей Supabase." };
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const limit = await guard("login", parsed.data.email, 20, 8);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Неверный email или пароль." };
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "Демо-режим: регистрация недоступна без ключей Supabase." };
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const limit = await guard("signup", parsed.data.email, 5, 3);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: error.message };
  // Если подтверждение email включено, сессии ещё нет — не редиректим молча,
  // а просим проверить почту (иначе middleware вернёт на /login без объяснения).
  if (data.session) redirect("/");
  return {
    info: "Аккаунт создан. Проверьте почту и перейдите по ссылке для подтверждения — затем войдите.",
  };
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
