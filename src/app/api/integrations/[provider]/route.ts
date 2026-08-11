import { NextResponse, type NextRequest } from "next/server";
import { getProvider, type ProviderName } from "@/lib/integrations";
import { codeChallengeFromVerifier, createCodeVerifier, createState } from "@/lib/crypto/pkce";

/**
 * Инициация OAuth-подключения календаря: GET /api/integrations/google|microsoft
 * Генерирует state + PKCE, кладёт их в httpOnly cookies и редиректит к провайдеру.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  }

  try {
    const state = createState();
    const verifier = createCodeVerifier();
    const challenge = codeChallengeFromVerifier(verifier);
    const url = getProvider(provider as ProviderName).buildAuthUrl(state, challenge);

    const res = NextResponse.redirect(url);
    const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
    res.cookies.set("oauth_state", state, cookieOpts);
    res.cookies.set("oauth_verifier", verifier, cookieOpts);
    res.cookies.set("oauth_provider", provider, cookieOpts);
    return res;
  } catch {
    // Ключи не заданы или иная ошибка конфигурации — мягкий возврат в настройки.
    return NextResponse.redirect(new URL("/settings?calendar_error=not_configured", _req.url));
  }
}
