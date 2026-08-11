"use client";

import { useActionState } from "react";
import Link from "next/link";
import { APP } from "@/config/app";
import { isDemoMode } from "@/lib/env";
import { signIn, signUp, type AuthState } from "./actions";
import { Button } from "@/components/ui/primitives";

export default function LoginPage() {
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});
  const error = signInState.error || signUpState.error;

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-bold">{APP.name}</h1>
        <p className="mt-1 text-sm text-muted">{APP.tagline}</p>

        {isDemoMode && (
          <div className="mt-4 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-xs text-[var(--warning)]">
            Демо-режим: вход не требуется. Откройте приложение{" "}
            <Link href="/" className="underline">
              на главной
            </Link>
            . Авторизация включится после настройки Supabase.
          </div>
        )}

        <form className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="text-xs font-medium text-muted">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-medium text-muted">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" formAction={signInAction} disabled={signingIn} className="flex-1">
              Войти
            </Button>
            <Button
              type="submit"
              formAction={signUpAction}
              disabled={signingUp}
              variant="outline"
              className="flex-1"
            >
              Регистрация
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
