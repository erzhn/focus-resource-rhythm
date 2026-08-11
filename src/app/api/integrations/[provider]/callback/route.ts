import { NextResponse, type NextRequest } from "next/server";
import { getProvider, IntegrationError, type ProviderName } from "@/lib/integrations";
import { encryptToken } from "@/lib/crypto/tokens";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: проверяет state, обменивает код на токены, шифрует refresh-токен
 * и (если настроен Supabase) сохраняет подключение. Токены не логируются.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const savedState = req.cookies.get("oauth_state")?.value;
  const verifier = req.cookies.get("oauth_verifier")?.value;

  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  }
  if (!code || !state || !savedState || state !== savedState || !verifier) {
    return NextResponse.redirect(new URL("/settings?calendar_error=state", req.url));
  }

  try {
    const tokens = await getProvider(provider as ProviderName).exchangeCode(code, verifier);

    // refresh-токен шифруется перед сохранением; в лог не пишем.
    const refreshEnc = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

    if (isSupabaseConfigured && refreshEnc) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("calendar_connections").upsert(
          {
            user_id: user.id,
            provider,
            account_email: "", // заполняется отдельным запросом профиля провайдера
            access_token_enc: encryptToken(tokens.accessToken),
            refresh_token_enc: refreshEnc,
            token_expires_at: tokens.expiresAt?.toISOString() ?? null,
            scopes: tokens.scopes,
            status: "active",
          },
          { onConflict: "user_id,provider,account_email" },
        );
      }
    }

    const res = NextResponse.redirect(new URL(`/settings?calendar_connected=${provider}`, req.url));
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_verifier");
    res.cookies.delete("oauth_provider");
    return res;
  } catch (e) {
    const msg = e instanceof IntegrationError ? "exchange" : "unknown";
    return NextResponse.redirect(new URL(`/settings?calendar_error=${msg}`, req.url));
  }
}
