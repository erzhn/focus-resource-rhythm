import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: файл прокси (бывший middleware). Обновляет сессию Supabase и защищает маршруты.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Пропускаем статику, изображения и публичные метафайлы.
  //
  // icon/apple-icon/manifest/robots обязаны отдаваться БЕЗ авторизации: иначе
  // браузер не сможет установить приложение на домашний экран, а краулер —
  // прочитать robots.txt (вместо файла они получали редирект на /login).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
